declare namespace IINA {
  /** APIs used by SubLingo across IINA 1.4.0–1.4.4. */
  interface SubLingoRuntimeAugmentation {
    core?: API.Core;
    event?: API.Event;
    file?: API.File;
    global?: API.Global;
    http?: API.HTTP;
    mpv?: API.MPV;
    preferences?: API.Preferences;
    sidebar?: API.SidebarView;
    utils?: API.Utils;
  }
}
