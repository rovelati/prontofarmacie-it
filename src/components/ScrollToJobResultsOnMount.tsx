import { useEffect } from 'react';

export function scrollToJobResults(behavior: ScrollBehavior = 'smooth') {
  document.getElementById('job-results')?.scrollIntoView({ behavior, block: 'start' });
}

export default function ScrollToJobResultsOnMount() {
  useEffect(() => {
    const timer = window.setTimeout(() => scrollToJobResults(), 120);
    return () => window.clearTimeout(timer);
  }, []);

  return null;
}
