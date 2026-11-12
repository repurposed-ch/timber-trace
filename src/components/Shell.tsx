import type { ReactNode } from "react";
import { Header, type Crumb } from "./Header";
import { SignIn } from "./SignIn";

type Props = {
  crumbs?: Crumb[];
  children: ReactNode;
  /** desktop: right column. `pinned` stays put (3D view), `scroll` scrolls on its own (QR, exports) */
  aside?: { pinned?: ReactNode; scroll?: ReactNode };
  /** extra classes on the frame, e.g. which aside part a phone shows */
  className?: string;
};

/**
 * The frame of every page: the header (breadcrumbs and shortcuts) on top, then the content.
 * Desktop: fixed height, main and the aside's lower part scroll separately, width depends on the
 * screen only. Phones: one scrolling page, header sticky, pinned part first.
 */
export function Shell({ crumbs, children, aside, className }: Props) {
  return (
    <div className={`shell${aside ? " has-aside" : ""}${className ? ` ${className}` : ""}`}>
      <div className="shell-head">
        <Header crumbs={crumbs} />
      </div>
      <div className="shell-body">
        {aside?.pinned && <div className="aside-pin">{aside.pinned}</div>}
        <main className="pane main-pane">{children}</main>
        {aside?.scroll && <div className="pane aside-pane">{aside.scroll}</div>}
      </div>
      <SignIn />
    </div>
  );
}
