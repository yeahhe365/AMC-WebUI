import { logService } from '@/services/logService';
import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { type UploadedFile } from '@/types';
import { MOBILE_BREAKPOINT_PX } from '@/constants/layout';
import { ensurePdfWorkerConfigured } from '@/utils/pdfRuntime';
import { useI18n } from '@/contexts/I18nContext';
import { formatI18nErrorMessage } from '@/i18n/interpolate';
import { getRotatedCoords } from '@/utils/media-nav/seekPdf';

const PDF_TABLET_BREAKPOINT_PX = 1024;
const INITIAL_MOBILE_SCALE = 0.6;
const INITIAL_TABLET_SCALE = 0.8;
const INITIAL_DESKTOP_SCALE = 1.1;
const PDF_ZOOM_STEP = 0.2;
const MIN_PDF_SCALE = 0.4;
const MAX_PDF_SCALE = 3.0;
const PDF_ROTATION_STEP_DEGREES = 90;
const FULL_ROTATION_DEGREES = 360;

const getInitialScale = () => {
  if (typeof window === 'undefined') return INITIAL_DESKTOP_SCALE;
  const width = window.innerWidth;
  if (width < MOBILE_BREAKPOINT_PX) return INITIAL_MOBILE_SCALE;
  if (width < PDF_TABLET_BREAKPOINT_PX) return INITIAL_TABLET_SCALE;
  return INITIAL_DESKTOP_SCALE;
};

export interface UsePdfViewerOptions {
  defaultShowSidebar?: boolean;
  defaultFitToWidth?: boolean;
}

export const usePdfViewer = (_file: UploadedFile, options?: UsePdfViewerOptions) => {
  ensurePdfWorkerConfigured();

  const { t } = useI18n();
  const [numPages, setNumPages] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;

  const [rotation, setRotation] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(() => options?.defaultShowSidebar ?? false);

  // Natural unscaled dimensions of page 1 in points (standard A4 default: 595 x 842)
  const [pageNaturalWidth, setPageNaturalWidth] = useState(595);
  const [pageNaturalHeight, setPageNaturalHeight] = useState(842);

  // Fit to container width state
  const [isFitToWidth, setIsFitToWidth] = useState(() => options?.defaultFitToWidth ?? true);
  const isFitToWidthRef = useRef(isFitToWidth);
  isFitToWidthRef.current = isFitToWidth;

  const [scale, setScale] = useState(getInitialScale);

  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Zoom anchor tracking: records which page was active and its exact offset from the container top
  const zoomAnchorRef = useRef<{ pageNumber: number; offsetFromContainerTop: number } | null>(null);
  const isZoomingRef = useRef(false);

  const prepareZoomAnchor = useCallback(() => {
    isZoomingRef.current = true;
    const container = containerRef.current;
    const pageNumber = currentPageRef.current;
    const pageEl = pageRefs.current.get(pageNumber);

    if (container && pageEl) {
      const offsetFromContainerTop = pageEl.getBoundingClientRect().top - container.getBoundingClientRect().top;
      zoomAnchorRef.current = { pageNumber, offsetFromContainerTop };
    }
  }, []);

  const computeFitScale = useCallback(
    (containerEl: HTMLElement | null): number | null => {
      if (!containerEl) return null;
      const clientWidth = containerEl.clientWidth;
      if (clientWidth <= 0) return null;

      // Available width subtracting container padding (32px) and scrollbar leeway
      const availableWidth = Math.max(clientWidth - 32, 160);
      const isRotated = rotation === 90 || rotation === 270;
      const effectiveWidth = isRotated ? pageNaturalHeight || 842 : pageNaturalWidth || 595;
      if (effectiveWidth <= 0) return null;

      const rawScale = availableWidth / effectiveWidth;
      return Math.min(Math.max(Math.round(rawScale * 100) / 100, MIN_PDF_SCALE), MAX_PDF_SCALE);
    },
    [rotation, pageNaturalHeight, pageNaturalWidth],
  );

  // Recompute scale when in fit-to-width mode upon container resize or dimensions change
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleResize = () => {
      if (isFitToWidthRef.current) {
        prepareZoomAnchor();
        const fitScale = computeFitScale(container);
        if (fitScale != null) {
          setScale(fitScale);
        }
      }
    };

    handleResize();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        handleResize();
      });
      observer.observe(container);
      return () => observer.disconnect();
    }
    return undefined;
  }, [computeFitScale, prepareZoomAnchor]);

  // Synchronously restore scroll position anchored to current page before paint
  useLayoutEffect(() => {
    const anchor = zoomAnchorRef.current;
    const container = containerRef.current;
    if (!anchor || !container) return undefined;

    const { pageNumber, offsetFromContainerTop } = anchor;
    const pageEl = pageRefs.current.get(pageNumber);

    if (pageEl) {
      const currentOffset = pageEl.getBoundingClientRect().top - container.getBoundingClientRect().top;
      const delta = currentOffset - offsetFromContainerTop;
      if (Math.abs(delta) > 0.5) {
        container.scrollTop += delta;
      }
    }

    zoomAnchorRef.current = null;

    const timer = setTimeout(() => {
      isZoomingRef.current = false;
    }, 250);

    return () => clearTimeout(timer);
  }, [scale]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !numPages || isLoading) return undefined;

    // High-precision scroll probing for active page tracking
    let scrollRaf: number | null = null;
    const handleScroll = () => {
      if (isZoomingRef.current) return;
      if (scrollRaf != null) return;

      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = null;
        if (isZoomingRef.current || !container) return;

        const containerRect = container.getBoundingClientRect();
        const probeY = containerRect.top + Math.min(containerRect.height * 0.35, 200);

        let bestPage = currentPageRef.current;
        let minDistance = Infinity;

        pageRefs.current.forEach((el, pageNum) => {
          if (!el) return;
          const rect = el.getBoundingClientRect();
          if (rect.top <= probeY && rect.bottom >= probeY) {
            bestPage = pageNum;
            minDistance = 0;
          } else if (minDistance !== 0) {
            const distance = Math.min(Math.abs(rect.top - probeY), Math.abs(rect.bottom - probeY));
            if (distance < minDistance) {
              minDistance = distance;
              bestPage = pageNum;
            }
          }
        });

        if (bestPage !== currentPageRef.current && bestPage > 0) {
          currentPageRef.current = bestPage;
          setCurrentPage(bestPage);
        }
      });
    };

    container.addEventListener('scroll', handleScroll, { passive: true });

    // Fallback IntersectionObserver for virtualized/test environments
    const observer = new IntersectionObserver(
      (entries) => {
        if (isZoomingRef.current) return;

        const visibleEntries = entries.filter((entry) => entry.isIntersecting);
        if (visibleEntries.length === 0) return;

        let bestEntry = visibleEntries[0];
        for (const entry of visibleEntries) {
          if (entry.intersectionRatio > bestEntry.intersectionRatio) {
            bestEntry = entry;
          }
        }

        const pageNum = Number(bestEntry.target.getAttribute('data-page-number'));
        if (!isNaN(pageNum) && pageNum > 0 && Math.abs(pageNum - currentPageRef.current) <= 1) {
          currentPageRef.current = pageNum;
          setCurrentPage(pageNum);
        }
      },
      {
        root: container,
        threshold: [0.2, 0.5, 0.8],
        rootMargin: '-10% 0px -40% 0px',
      },
    );

    pageRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollRaf != null) cancelAnimationFrame(scrollRaf);
      observer.disconnect();
    };
  }, [numPages, isLoading]);

  useEffect(() => {
    if (showSidebar && sidebarRef.current) {
      const thumbnail = sidebarRef.current.querySelector(`[data-thumbnail-page="${currentPage}"]`);
      if (thumbnail) {
        thumbnail.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentPage, showSidebar]);

  const onDocumentLoadSuccess = (data: { numPages: number }) => {
    setNumPages(data.numPages);
    setIsLoading(false);

    try {
      const pdfDoc = data as any;
      if (typeof pdfDoc?.getPage === 'function') {
        pdfDoc
          .getPage(1)
          .then((page: any) => {
            const viewport = page?.getViewport?.({ scale: 1 });
            if (viewport?.width > 0 && viewport?.height > 0) {
              setPageNaturalWidth(viewport.width);
              setPageNaturalHeight(viewport.height);
            }
          })
          .catch(() => {});
      }
    } catch {
      // Fallback natural dimensions already set
    }
  };

  const onDocumentLoadError = (error: Error) => {
    setIsLoading(false);
    setError(formatI18nErrorMessage(t, 'pdfLoadFailedWithMessage', error.message));
    logService.error('PDF Load Error:', error);
  };

  /** Scrolls to a page; returns false when the page element is not mounted yet. */
  const scrollToPage = (
    pageNumber: number,
    targetCoords?: { box2d?: [number, number, number, number]; point?: [number, number] } | null,
  ): boolean => {
    const pageElement = pageRefs.current.get(pageNumber);
    if (pageElement) {
      const container = containerRef.current;
      if (container && targetCoords && (targetCoords.box2d || targetCoords.point)) {
        const rotated = getRotatedCoords(targetCoords.box2d, targetCoords.point, rotation);
        let normY: number;
        let normX: number;
        if (rotated) {
          const centerYPercent = rotated.isPoint ? rotated.top : rotated.top + rotated.height / 2;
          const centerXPercent = rotated.isPoint ? rotated.left : rotated.left + rotated.width / 2;
          normY = centerYPercent / 100;
          normX = centerXPercent / 100;
        } else {
          normY = targetCoords.box2d
            ? Math.min(targetCoords.box2d[0], targetCoords.box2d[2]) / 1000
            : targetCoords.point
              ? targetCoords.point[0] / 1000
              : 0;
          normX = targetCoords.box2d
            ? Math.min(targetCoords.box2d[1], targetCoords.box2d[3]) / 1000
            : targetCoords.point
              ? targetCoords.point[1] / 1000
              : 0;
        }
        const pageOffsetTop = pageElement.offsetTop;
        const pageOffsetLeft = pageElement.offsetLeft;
        const targetPixelY = pageOffsetTop + normY * pageElement.clientHeight;
        const targetPixelX = pageOffsetLeft + normX * pageElement.clientWidth;
        const desiredScrollTop = Math.max(0, targetPixelY - container.clientHeight / 2);
        const desiredScrollLeft = Math.max(0, targetPixelX - container.clientWidth / 2);
        if (typeof container.scrollTo === 'function') {
          container.scrollTo({ top: desiredScrollTop, left: desiredScrollLeft, behavior: 'smooth' });
        } else {
          container.scrollTop = desiredScrollTop;
          container.scrollLeft = desiredScrollLeft;
        }
      } else {
        pageElement.scrollIntoView({ behavior: 'auto', block: 'start' });
      }
      setCurrentPage(pageNumber);
      return true;
    }
    return false;
  };

  const previousPage = () => {
    const previousPageNumber = Math.max(1, currentPage - 1);
    scrollToPage(previousPageNumber);
  };

  const nextPage = () => {
    const nextPageNumber = Math.min(numPages || 1, currentPage + 1);
    scrollToPage(nextPageNumber);
  };

  const handlePageInputCommit = (pageInput: string) => {
    const page = parseInt(pageInput, 10);
    if (!isNaN(page) && page >= 1 && page <= (numPages || 1)) {
      scrollToPage(page);
    }
  };

  const handleZoomIn = () => {
    setIsFitToWidth(false);
    prepareZoomAnchor();
    setScale((previousScale) => Math.min(Math.round((previousScale + PDF_ZOOM_STEP) * 10) / 10, MAX_PDF_SCALE));
  };

  const handleZoomOut = () => {
    setIsFitToWidth(false);
    prepareZoomAnchor();
    setScale((previousScale) => Math.max(Math.round((previousScale - PDF_ZOOM_STEP) * 10) / 10, MIN_PDF_SCALE));
  };

  const handleRotate = () => {
    prepareZoomAnchor();
    setRotation((previousRotation) => (previousRotation + PDF_ROTATION_STEP_DEGREES) % FULL_ROTATION_DEGREES);
  };

  const handleFitToWidth = () => {
    setIsFitToWidth(true);
    prepareZoomAnchor();
    if (containerRef.current) {
      const fitScale = computeFitScale(containerRef.current);
      if (fitScale != null) {
        setScale(fitScale);
      }
    }
  };

  const toggleSidebar = () => setShowSidebar((isSidebarVisible) => !isSidebarVisible);
  const closeSidebar = () => setShowSidebar(false);

  const setPageRef = useCallback((pageNum: number, element: HTMLDivElement | null) => {
    if (element) {
      pageRefs.current.set(pageNum, element);
    } else {
      pageRefs.current.delete(pageNum);
    }
  }, []);

  return {
    numPages,
    currentPage,
    scale,
    rotation,
    isLoading,
    error,
    showSidebar,
    isFitToWidth,
    pageNaturalWidth,
    pageNaturalHeight,
    containerRef,
    sidebarRef,
    setPageRef,
    onDocumentLoadSuccess,
    onDocumentLoadError,
    scrollToPage,
    previousPage,
    nextPage,
    handlePageInputCommit,
    handleZoomIn,
    handleZoomOut,
    handleRotate,
    handleFitToWidth,
    toggleSidebar,
    closeSidebar,
  };
};
