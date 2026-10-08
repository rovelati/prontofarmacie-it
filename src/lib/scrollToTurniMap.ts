export function scrollToTurniMap(behavior: ScrollBehavior = 'smooth') {
  document.getElementById('turni-map')?.scrollIntoView({ behavior, block: 'start' });
}
