declare namespace IINA {
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

  interface SubLingoMpvSubtitleTrackNode {
    type: "sub";
    id: number;
    selected: boolean;
    "main-selection": number;
    external: boolean;
    codec?: string;
    "ff-index"?: number;
    "src-id"?: number;
    lang?: string;
    title?: string;
  }
}
