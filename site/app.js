const copy = document.querySelector("[data-copy]");
copy?.addEventListener("click", async () => {
  const command = copy.previousElementSibling?.textContent ?? "";
  await navigator.clipboard.writeText(command);
  copy.textContent = "Copied";
  window.setTimeout(() => { copy.textContent = "Copy"; }, 1600);
});
