// This string stays as plain worker JavaScript because Pyodide needs a runtime base URL before importScripts().
// __PYODIDE_BASE_URL__ is replaced by buildPyodideWorkerScript at runtime.
export const PYODIDE_WORKER_CODE_TEMPLATE = `
const PYODIDE_BASE_URL = "__PYODIDE_BASE_URL__";

const JSDELIVR_HOST = 'cdn.jsdelivr.net';
const JSDELIVR_MIRRORS = [
  'cdn.jsdelivr.net',
  'fastly.jsdelivr.net',
  'gcore.jsdelivr.net',
  'testingcf.jsdelivr.net',
];

const originalFetch = typeof self !== 'undefined' && self.fetch ? self.fetch.bind(self) : null;

async function fetchWithTimeout(url, init, timeoutMs = 20000) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await originalFetch(url, {
      ...init,
      signal: init && init.signal ? init.signal : (controller ? controller.signal : undefined),
    });
    if (timer) clearTimeout(timer);
    return res;
  } catch (timeoutFetchError) {
    if (timer) clearTimeout(timer);
    throw timeoutFetchError;
  }
}

async function resilientFetch(input, init) {
  if (!originalFetch) return fetch(input, init);
  const urlStr = typeof input === 'string' ? input : (input && input.url ? input.url : '');
  const isPyodideAsset = urlStr.includes('.whl') || urlStr.includes('pyodide-lock.json') || urlStr.includes('.wasm') || urlStr.includes('.zip');

  if (!isPyodideAsset) {
    return originalFetch(input, init);
  }

  // 1. Try local CacheStorage in Worker if supported
  let cache = null;
  try {
    if (typeof self !== 'undefined' && 'caches' in self && self.caches) {
      cache = await self.caches.open('pyodide-package-cache-v1');
      const cached = await cache.match(urlStr);
      if (cached) {
        return cached;
      }
    }
  } catch (cacheErr) {
    // Ignore cache read failures
  }

  // 2. Fetch with CDN mirrors
  let parsedUrl;
  try {
    parsedUrl = new URL(urlStr, self.location ? self.location.href : undefined);
  } catch (urlParseError) {
    return originalFetch(input, init);
  }

  const isJsdelivr = parsedUrl.hostname === JSDELIVR_HOST;
  if (!isJsdelivr) {
    // Same-origin or other non-CDN asset roots (the default local deployment):
    // fetch as-is. Rebuilding the URL against a forced https host would drop
    // the port and break local dev/Docker origins.
    return originalFetch(input, init);
  }
  const hostsToTry = JSDELIVR_MIRRORS;
  let lastError = null;

  for (const host of hostsToTry) {
    const targetUrl = new URL(parsedUrl.pathname + parsedUrl.search, 'https://' + host).href;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetchWithTimeout(targetUrl, init, 15000);
        if (response.ok) {
          // If we successfully fetched from CDN, persist to CacheStorage in background
          if (cache) {
            try {
              cache.put(urlStr, response.clone());
            } catch (putErr) {
              // Ignore cache write failures
            }
          }
          return response;
        } else if (response.status === 404) {
          lastError = new Error('HTTP 404 from ' + host);
          break;
        } else {
          lastError = new Error('HTTP ' + response.status + ' from ' + host);
        }
      } catch (hostFetchError) {
        lastError = hostFetchError;
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  }

  throw lastError || new Error('Failed to fetch Pyodide asset: ' + urlStr);
}

if (typeof self !== 'undefined' && originalFetch) {
  self.fetch = resilientFetch;
}

importScripts(PYODIDE_BASE_URL + "pyodide.js");

let pyodide = null;
let pyodideReadyPromise = null;

async function loadPyodideAndPackages() {
  if (!pyodide) {
    pyodide = await loadPyodide({
      indexURL: PYODIDE_BASE_URL,
    });
    // Non-blocking stdin: raises EOFError immediately on interactive input() instead of hanging
    pyodide.setStdin({
      isatty: false,
      read: () => '',
    });
    // Best-effort micropip preload for dynamic package installation without blocking offline starts
    try {
      await pyodide.loadPackage(['micropip']);
    } catch (micropipError) {
      // Allow execution to proceed offline with standard library
    }
  }
  return pyodide;
}

function getMimeType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const mimeMap = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    txt: 'text/plain',
    csv: 'text/csv',
    json: 'application/json',
    py: 'text/x-python',
    js: 'text/javascript',
    html: 'text/html',
    md: 'text/markdown',
    pdf: 'application/pdf',
    zip: 'application/zip',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

function ensureArrayBuffer(data) {
    const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
    return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

function normalizeErrorMessage(error) {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    if (error && typeof error.message === 'string') return error.message;
    return String(error);
}

function sanitizeRelativePath(name) {
    // NOTE: this template is embedded in an outer JS template literal, so every
    // backslash here must be doubled ([/\\\\]) to survive as [/\\] in the worker.
    const clean = String(name || '').replace(/^[/\\\\]+/, '').replace(/^[a-zA-Z]:[/\\\\]+/, '');
    const parts = clean.split(/[/\\\\]+/).filter((p) => p && p !== '.' && p !== '..');
    return parts.join('/') || 'file';
}

function ensureDir(path) {
    const segments = path.split('/').filter(Boolean);
    let current = '';
    for (const segment of segments) {
        current += '/' + segment;
        try {
            pyodide.FS.mkdir(current);
        } catch (mkdirError) {
            if (mkdirError && mkdirError.errno === 20) {
                continue;
            }
            throw mkdirError;
        }
    }
}

function removePath(path) {
    try {
        const stat = pyodide.FS.stat(path);
        if (pyodide.FS.isDir(stat.mode)) {
            const entries = pyodide.FS.readdir(path);
            for (const entry of entries) {
                if (entry === '.' || entry === '..') continue;
                removePath(path + '/' + entry);
            }
            pyodide.FS.rmdir(path);
            return;
        }
        pyodide.FS.unlink(path);
    } catch (removePathError) {
        // Best-effort cleanup
    }
}

function listFilesRecursively(targetDir, subPath = '') {
    const files = [];
    const dirToRead = subPath ? targetDir + '/' + subPath : targetDir;
    let entries = [];
    try {
        entries = pyodide.FS.readdir(dirToRead);
    } catch (readdirError) {
        return files;
    }
    for (const entry of entries) {
        if (entry === '.' || entry === '..') continue;
        const relativePath = subPath ? subPath + '/' + entry : entry;
        const fullPath = targetDir + '/' + relativePath;
        try {
            const stat = pyodide.FS.stat(fullPath);
            if (pyodide.FS.isDir(stat.mode)) {
                files.push(...listFilesRecursively(targetDir, relativePath));
            } else if (pyodide.FS.isFile(stat.mode)) {
                files.push(relativePath);
            }
        } catch (statError) {
            // best-effort
        }
    }
    return files;
}

async function installDependencies(code) {
    try {
        await pyodide.loadPackagesFromImports(code);
    } catch (dependencyError) {
        const message = normalizeErrorMessage(dependencyError);
        if (/No known package|not found|could not find|unknown package/i.test(message)) {
            throw new Error("A requested dependency is not available in Pyodide: " + message + ". CRITICAL: Do NOT retry run_local_python. Provide the code or text representation directly.");
        }
        throw new Error("Python dependency download failed (network/CDN mirror unreachable): " + message + ". CRITICAL: Do NOT retry run_local_python. Provide the Python code or text representation directly.");
    }
}

self.onmessage = async (event) => {
  const { type, id, code, files } = event.data;
  let stdout = [];

  try {
    if (!pyodideReadyPromise) {
      pyodideReadyPromise = loadPyodideAndPackages();
    }
    await pyodideReadyPromise;

    if (type === 'WARMUP') {
      self.postMessage({ status: 'success', type: 'WARMUP_READY' });
      return;
    }

    const previousDir = pyodide.FS.cwd();
    const runDir = '/tmp/local-python-' + id;

    removePath(runDir);
    ensureDir(runDir);

    let result;
    const transferBuffers = [];

    try {
      if (files && Array.isArray(files)) {
          for (const file of files) {
              const safeName = sanitizeRelativePath(file.name);
              const parentDir = safeName.includes('/')
                  ? runDir + '/' + safeName.split('/').slice(0, -1).join('/')
                  : runDir;
              ensureDir(parentDir);
              pyodide.FS.writeFile(runDir + '/' + safeName, new Uint8Array(file.data));
          }
      }

      pyodide.FS.chdir(runDir);

      const initialFiles = new Set();
      try {
          const fsFiles = listFilesRecursively(runDir);
          for (const file of fsFiles) initialFiles.add(file);
      } catch (initialListError) {
        // Listing the starting file set is best-effort; an empty dir is fine.
      }

      pyodide.setStdout({ batched: (msg) => stdout.push(msg) });
      pyodide.setStderr({ batched: (msg) => stdout.push(msg) });

      await installDependencies(code);

      // Reset matplotlib state carried over from any prior run before executing.
      await pyodide.runPythonAsync(\`
        try:
          import matplotlib
          matplotlib.use("Agg")
          import matplotlib.pyplot as plt
          plt.close('all')
        except Exception:
          pass
      \`);

      const executionGlobals = pyodide.globals.get('dict')();
      try {
        result = await pyodide.runPythonAsync(code, { globals: executionGlobals });
      } finally {
        try {
          executionGlobals.destroy();
        } catch (globalsCleanupError) {
          // best-effort cleanup
        }
      }

      const generatedOutputFiles = [];
      try {
          const finalFiles = listFilesRecursively(runDir);
          for (const filePath of finalFiles) {
              if (!initialFiles.has(filePath)) {
                   const content = pyodide.FS.readFile(runDir + '/' + filePath);
                   const fileBuffer = ensureArrayBuffer(content);
                   generatedOutputFiles.push({
                       name: filePath,
                       data: fileBuffer,
                       type: getMimeType(filePath)
                   });
                   transferBuffers.push(fileBuffer);
              }
          }
      } catch (outputError) {
          console.error("Error reading output files", normalizeErrorMessage(outputError));
      }

      let image = null;
      const hasPlot = pyodide.runPython(\`
        try:
          import matplotlib.pyplot as plt
          len(plt.get_fignums()) > 0
        except:
          False
      \`);

      if (hasPlot) {
          const plotPath = runDir + '/__matplotlib_plot__.png';
          pyodide.runPython(
              "import matplotlib.pyplot as plt\\n" +
              "plt.savefig(" + JSON.stringify(plotPath) + ", format='png', bbox_inches='tight')\\n" +
              "plt.close('all')"
          );
          try {
              const content = pyodide.FS.readFile(plotPath);
              image = ensureArrayBuffer(content);
              pyodide.FS.unlink(plotPath);
          } catch (plotReadError) {
              // best-effort plot extraction
          }
      }

      if (image && generatedOutputFiles.some((file) => file.type.startsWith('image/'))) {
          image = null;
      } else if (image) {
          transferBuffers.push(image);
      }

      self.postMessage({
        id,
        status: 'success',
        output: stdout.join('\\n'),
        image,
        files: generatedOutputFiles,
        result: result !== undefined ? String(result) : undefined
      }, transferBuffers);
    } finally {
      try {
          pyodide.runPython(
              "try:\\n" +
              "    import matplotlib.pyplot as plt\\n" +
              "    plt.close('all')\\n" +
              "    plt.rcdefaults()\\n" +
              "except Exception:\\n" +
              "    pass"
          );
      } catch (cleanupError) {
          // best-effort isolation cleanup between runs
      }
      try {
          pyodide.FS.chdir(previousDir);
      } catch (restoreDirError) {
          // ignore best-effort restore
      }
      removePath(runDir);
    }

  } catch (executionError) {
    self.postMessage({
      id,
      status: 'error',
      output: stdout && stdout.length > 0 ? stdout.join('\\n') : undefined,
      error: normalizeErrorMessage(executionError)
    });
  }
};
`;
