export function animateStakeChipFlight(target: HTMLElement | { x: number; y: number }): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const source = document.querySelector<HTMLElement>("[data-stake-chip-source]");
  if (!source) return;

  const start = source.getBoundingClientRect();
  let targetElement: HTMLElement | null = null;
  let endX: number;
  let endY: number;
  if (target instanceof HTMLElement) {
    targetElement = target;
    const end = target.getBoundingClientRect();
    if (!end.width || !end.height) return;
    endX = end.left + end.width / 2;
    endY = end.top + end.height / 2;
  } else {
    endX = target.x;
    endY = target.y;
  }
  if (!start.width || !start.height) return;

  const amount = source.dataset.stakeChipAmount ?? "";
  const token = document.createElement("span");
  token.className = "stake-chip-flight";
  token.setAttribute("aria-hidden", "true");
  const coin = document.createElement("i");
  const label = document.createElement("b");
  label.textContent = amount;
  token.append(coin, label);
  token.style.left = `${start.left + start.width / 2}px`;
  token.style.top = `${start.top + start.height / 2}px`;
  document.body.append(token);

  const dx = endX - start.left - start.width / 2;
  const dy = endY - start.top - start.height / 2;
  const animation = token.animate([
    { transform: "translate(-50%, -50%) scale(.58)", opacity: 0 },
    { transform: `translate(calc(-50% + ${dx * 0.58}px), calc(-50% + ${dy * 0.58 - 24}px)) scale(1.04)`, opacity: 1, offset: 0.55 },
    { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.72)`, opacity: 0 },
  ], { duration: 620, easing: "cubic-bezier(.18,.74,.28,1)" });
  animation.onfinish = () => token.remove();
  animation.oncancel = () => token.remove();

  if (targetElement) {
    try {
      targetElement.animate(
        [{ filter: "brightness(1)" }, { filter: "brightness(1.3)" }, { filter: "brightness(1)" }],
        { duration: 420, easing: "ease-out" },
      );
    } catch {
      // The token still flies on browsers without element animations.
    }
  }
}
