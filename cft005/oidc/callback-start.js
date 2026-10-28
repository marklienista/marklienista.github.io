// Run before the deferred SDK. Keep the callback only in memory, clear browser
// history and erase this one-use handoff when the application consumes it.
(() => {
  let href = location.href;
  history.replaceState(null, '', location.pathname);
  globalThis.__cft005TakeCallback = () => {
    const once = href;
    href = null;
    delete globalThis.__cft005TakeCallback;
    return once;
  };
})();
