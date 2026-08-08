const storageKey = "xiaofen-comic-workbench-v1";
const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");

document.querySelectorAll(".asset-tabs button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".asset-tabs button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    const image = document.querySelector("#asset-image");
    const link = document.querySelector("#asset-link");
    image.src = button.dataset.asset;
    image.alt = `小粉${button.dataset.label}`;
    link.href = button.dataset.asset;
    document.querySelector("#asset-label").textContent = `${button.dataset.label} · 点击查看原图`;
  });
});

function persist() {
  const state = { shots: {}, checks: {} };
  document.querySelectorAll(".shot").forEach((shot) => {
    state.shots[shot.dataset.shot] = {
      status: shot.querySelector("select").value,
      note: shot.querySelector("textarea").value
    };
  });
  document.querySelectorAll("[data-check]").forEach((check) => {
    state.checks[check.dataset.check] = check.checked;
  });
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function updateProgress() {
  const shots = [...document.querySelectorAll(".shot")];
  const completed = shots.filter((shot) => shot.querySelector("select").value === "已完成").length;
  const percent = Math.round((completed / shots.length) * 100);
  document.querySelector("#page-progress").value = completed;
  document.querySelector("#progress-label").textContent = `${completed} / ${shots.length} 格完成`;
  document.querySelector("#progress-percent").textContent = `${percent}%`;
  shots.forEach((shot) => shot.dataset.status = shot.querySelector("select").value);
}

document.querySelectorAll(".shot").forEach((shot) => {
  const state = saved.shots?.[shot.dataset.shot];
  if (state) {
    shot.querySelector("select").value = state.status;
    shot.querySelector("textarea").value = state.note;
  }
  shot.querySelector("select").addEventListener("change", () => {
    updateProgress();
    persist();
  });
  shot.querySelector("textarea").addEventListener("input", persist);
});

document.querySelectorAll("[data-check]").forEach((check) => {
  check.checked = Boolean(saved.checks?.[check.dataset.check]);
  check.addEventListener("change", persist);
});

updateProgress();
