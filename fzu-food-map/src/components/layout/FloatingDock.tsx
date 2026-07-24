import { useEffect, useState } from "react";
import type { ThemeMode } from "../../theme";
import type { AppIconPaths } from "../../utils/assetPaths";
import "./FloatingDock.css";

type FloatingDockProps = {
  infoOpen: boolean;
  announcementHtml: string;
  theme: ThemeMode;
  trackingUserLocation: boolean;
  icons: AppIconPaths;
  onInfoToggle: () => void;
  onThemeToggle: () => void;
  onUserLocationToggle: () => void;
};

export function FloatingDock({
  infoOpen,
  announcementHtml,
  theme,
  trackingUserLocation,
  icons,
  onInfoToggle,
  onThemeToggle,
  onUserLocationToggle
}: FloatingDockProps) {
  const [announcementIconError, setAnnouncementIconError] = useState(false);
  const [locateIconError, setLocateIconError] = useState(false);
  const [themeIconError, setThemeIconError] = useState(false);

  useEffect(() => {
    setAnnouncementIconError(false);
    setLocateIconError(false);
    setThemeIconError(false);
  }, [theme]);

  return (
    <div className="floating-dock" role="group" aria-label="界面功能">
      <div className="floating-actions">
        <button
          type="button"
          className={`floating-action-button${trackingUserLocation ? " floating-action-button--active" : ""}`}
          onClick={onUserLocationToggle}
          aria-label={trackingUserLocation ? "停止定位" : "显示我的位置"}
          title={trackingUserLocation ? "停止定位" : "显示我的位置"}
        >
          <span className="floating-action-icon" aria-hidden="true">
            {locateIconError ? (
              "📍"
            ) : (
              <img
                src={icons.locate}
                alt=""
                onLoad={() => setLocateIconError(false)}
                onError={() => setLocateIconError(true)}
              />
            )}
          </span>
        </button>
        <button
          type="button"
          className={`floating-action-button floating-action-button--info${
            infoOpen ? " floating-action-button--active" : ""
          }`}
          aria-controls="toolbar-announcement"
          onClick={onInfoToggle}
          aria-label="公告"
          title="公告"
        >
          <span className="info-button-icon" aria-hidden="true">
            {announcementIconError ? (
              "!"
            ) : (
              <img
                src={icons.announcement}
                alt=""
                onLoad={() => setAnnouncementIconError(false)}
                onError={() => setAnnouncementIconError(true)}
              />
            )}
          </span>
        </button>
        <button
          type="button"
          className="floating-action-button theme-toggle"
          onClick={onThemeToggle}
          aria-label={theme === "light" ? "深色模式" : "浅色模式"}
          title={theme === "light" ? "深色模式" : "浅色模式"}
        >
          <span className="floating-action-icon" aria-hidden="true">
            {themeIconError ? (
              theme === "light" ? "🌙" : "☀️"
            ) : (
              <img
                src={icons.themeToggle}
                alt=""
                onLoad={() => setThemeIconError(false)}
                onError={() => setThemeIconError(true)}
              />
            )}
          </span>
        </button>
      </div>
      {infoOpen && (
        <div id="toolbar-announcement" className="info-panel" role="region" aria-live="polite">
          <div
            className="info-panel-content scrollable-card"
            dangerouslySetInnerHTML={{ __html: announcementHtml }}
          />
        </div>
      )}
    </div>
  );
}
