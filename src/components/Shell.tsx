import type { ReactNode } from "react";
import { Header, type Crumb } from "./Header";
import { SignIn } from "./SignIn";

type Props = {
  crumbs?: Crumb[];
  children: ReactNode;
  /** desktop: right column. `pinned` stays put (3D view), `scroll` scrolls on its own (QR, exports) */
  aside?: { pinned?: ReactNode; scroll?: ReactNode; labels?: { pinned?: string; scroll?: string } };
  /** the page's name as a hidden <h1>, for pages without a visible one (Home has its own) */
  title?: string;
  /** extra classes on the frame, e.g. which aside part a phone shows */
  className?: string;
};

/**
 * The frame of every page: the header (breadcrumbs and shortcuts) on top, then the content.
 * Desktop: fixed height, main and the aside's lower part scroll separately, width depends on the
 * screen only. Phones: one scrolling page, header sticky, pinned part first.
 */
export function Shell({ crumbs, children, aside, className, title }: Props) {
  return (
    <div className={`shell${aside ? " has-aside" : ""}${className ? ` ${className}` : ""}`}>
      <div className="shell-head">
        <Header crumbs={crumbs} />
      </div>
      <div className="shell-body">
        {aside?.pinned && (
          <aside className="aside-pin" aria-label={aside.labels?.pinned}>
            {aside.pinned}
          </aside>
        )}
        <main className="pane main-pane">
          {title && <h1 className="sr-only">{title}</h1>}
          {children}
        </main>
        {aside?.scroll && (
          <aside className="pane aside-pane" aria-label={aside.labels?.scroll}>
            {aside.scroll}
          </aside>
        )}
      </div>
      <SignIn />
    </div>
  );
}
