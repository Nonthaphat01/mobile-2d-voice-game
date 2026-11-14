/**
 * My Little Neighborhood V5 — 2-track background music.
 * Track files are provided separately at assets/music/track-1.mp3 and track-2.mp3.
 * Browser sound playback begins on the player's Join/Play click.
 */
(() => {
  "use strict";
  const playlist = [
    {file:"assets/music/track-1.mp3", label:"ข้ามเส้นนี้ไปด้วยกันไหม"},
    {file:"assets/music/track-2.mp3", label:"พรุ่งนี้ยังมี"}
  ];
  const audio = document.createElement("audio");
  audio.id = "neighborhood-bgm";
  audio.preload = "none";
  audio.playsInline = true;
  audio.loop = false;
  audio.volume = .20;
  audio.style.display = "none";
  audio.setAttribute("aria-hidden","true");
  document.body.appendChild(audio);
  let active = false, enabled = true, track = 0, talking = false;
  let missing = new Set(), denied = false, loadingSerial = 0;
  const volume = () => talking ? .08 : .20;

  function applyVolume() {
    const next = enabled ? volume() : 0;
    if (Math.abs(audio.volume - next) > .005) audio.volume = next;
  }
  function playCurrent() {
    if (!active || !enabled || missing.size === playlist.length) return;
    const serial = ++loadingSerial;
    denied = false;
    const uri = playlist[track].file;
    if (audio.getAttribute("src") !== uri) {
      audio.setAttribute("src",uri);
      audio.load();
    }
    applyVolume();
    const pending = audio.play();
    pending?.catch?.(error => {
      if (serial !== loadingSerial || !active || !enabled) return;
      // Autoplay is gesture-gated; do not advance music on NotAllowedError.
      if (error?.name === "NotAllowedError") { denied = true; return; }
      if (error?.name === "AbortError") return;
      next(true);
    });
  }
  function next(failed = false) {
    if (failed) missing.add(track);
    if (!active || missing.size === playlist.length) { audio.pause(); return; }
    track = (track + 1) % playlist.length;
    playCurrent();
  }
  audio.addEventListener("ended", () => next(false));
  audio.addEventListener("error", () => {
    if (!active || !enabled) return;
    next(true);
  });

  // Call this directly from Join / Play button click to satisfy browser policy.
  function enter() {
    active = true;
    if (missing.size === playlist.length) missing = new Set();
    playCurrent();
  }
  function exit() {
    active = false;
    loadingSerial++;
    audio.pause();
    audio.currentTime = 0;
    track = 0;
    talking = false;
    denied = false;
  }
  function setEnabled(value) {
    enabled = Boolean(value);
    applyVolume();
    if (!enabled) { loadingSerial++; audio.pause(); return; }
    if (active) playCurrent();
  }
  function setTalking(value) {
    const isTalking = Boolean(value);
    if (talking === isTalking) return;
    talking = isTalking;
    applyVolume();
  }
  function resume() {
    if (active && enabled && (denied || audio.paused)) playCurrent();
  }
  document.addEventListener("pointerdown", () => {
    if (active && denied) resume();
  }, {passive:true});
  window.neighborhoodMusic = {
    enter, exit, setEnabled, setTalking, resume,
    get enabled() { return enabled; },
    get ready() { return missing.size !== playlist.length; },
    get currentSong() { return playlist[track].label; },
    get missingAssets() { return missing.size === playlist.length; },
    get volume() { return volume(); }
  };
})();