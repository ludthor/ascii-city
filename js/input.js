export function createInput(canvas, overlay) {
  const keys = new Set();
  const state = {
    forward: false,
    back: false,
    left: false,
    right: false,
    sprint: false,
    yawDelta: 0,
    pitchDelta: 0,
    locked: false,
    minimap: true,
    wantMute: false,
  };

  function syncMove() {
    state.forward = keys.has("KeyW") || keys.has("ArrowUp");
    state.back = keys.has("KeyS") || keys.has("ArrowDown");
    state.left = keys.has("KeyA") || keys.has("ArrowLeft");
    state.right = keys.has("KeyD") || keys.has("ArrowRight");
    state.sprint = keys.has("ShiftLeft") || keys.has("ShiftRight");
  }

  function requestLock() {
    canvas.requestPointerLock();
  }

  overlay.addEventListener("click", requestLock);
  canvas.addEventListener("click", () => {
    if (!state.locked) requestLock();
  });

  document.addEventListener("pointerlockchange", () => {
    state.locked = document.pointerLockElement === canvas;
    if (new URLSearchParams(location.search).get("preview") !== "1") {
      overlay.classList.toggle("hidden", state.locked);
    }
    document.body.classList.toggle("locked", state.locked);
  });

  document.addEventListener("mousemove", (e) => {
    if (!state.locked) return;
    state.yawDelta += e.movementX;
    state.pitchDelta += e.movementY;
  });

  document.addEventListener("keydown", (e) => {
    keys.add(e.code);
    syncMove();
    if (e.code === "KeyM" && !e.repeat) {
      state.minimap = !state.minimap;
      e.preventDefault();
    }
    if (e.code === "KeyK" && !e.repeat) {
      state.wantMute = true;
      e.preventDefault();
    }
    if (state.locked && ["KeyW", "KeyA", "KeyS", "KeyD", "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
      e.preventDefault();
    }
  });

  document.addEventListener("keyup", (e) => {
    keys.delete(e.code);
    syncMove();
  });

  window.addEventListener("blur", () => {
    keys.clear();
    syncMove();
  });

  return {
    state,
    consumeLook() {
      const yaw = state.yawDelta;
      const pitch = state.pitchDelta;
      state.yawDelta = 0;
      state.pitchDelta = 0;
      return { yaw, pitch };
    },
  };
}
