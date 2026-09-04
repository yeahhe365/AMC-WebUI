import { logService } from '@/services/logService';
import { useState, useEffect, useRef, useCallback } from 'react';
import { type UploadedFile } from '@/types';
import { MOBILE_BREAKPOINT_PX } from '@/constants/layout';
import { ensurePdfWorkerConfigured } from '@/utils/pdfRuntime';
import { useI18n } from '@/contexts/I18nContext';
import { formatI18nErrorMessage } from '@/i18n/interpolate';

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

export const usePdfViewer = (_file: UploadedFile) => {
  ensurePdfWorkerConfigured();

  const { t } = useI18n();
  const [numPages, setNumPages] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(getInitialScale);
  const [rotation, setRotation] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= PDF_TABLET_BREAKPOINT_PX,
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !numPages || isLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const pageNum = Number(entry.target.getAttribute('data-page-number'));
            if (!isNaN(pageNum)) {
              setCurrentPage(pageNum);
            }
          }
        });
      },
      {
        root: container,
        threshold: 0.1,
        rootMargin: '-10% 0px -60% 0px',
      },
    );

    pageRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [numPages, isLoading]);

  useEffect(() => {
    if (showSidebar && sidebarRef.current) {
      const thumbnail = sidebarRef.current.querySelector(`[data-thumbnail-page="${currentPage}"]`);
      if (thumbnail) {
        thumbnail.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentPage, showSidebar]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setIsLoading(false);
  };

  const onDocumentLoadError = (error: Error) => {
    setIsLoading(false);
    setError(formatI18nErrorMessage(t, 'pdfLoadFailedWithMessage', error.message));
    logService.error('PDF Load Error:', error);
  };

  /** Scrolls to a page; returns false when the page element is not mounted yet. */
  const scrollToPage = (pageNumber: number): boolean => {
    const pageElement = pageRefs.current.get(pageNumber);
    if (pageElement) {
      pageElement.scrollIntoView({ behavior: 'auto', block: 'start' });
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

  const handleZoomIn = () => setScale((previousScale) => Math.min(previousScale + PDF_ZOOM_STEP, MAX_PDF_SCALE));
  const handleZoomOut = () => setScale((previousScale) => Math.max(previousScale - PDF_ZOOM_STEP, MIN_PDF_SCALE));
  const handleRotate = () =>
    setRotation((previousRotation) => (previousRotation + PDF_ROTATION_STEP_DEGREES) % FULL_ROTATION_DEGREES);
  const toggleSidebar = () => setShowSidebar((isSidebarVisible) => !isSidebarVisible);

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
    toggleSidebar,
  };
};
