import type { ReactNode } from "react";
import { Header, type Crumb } from "./Header";

type Props = {
  crumbs?: Crumb[];
  /** the bar under the header: tabs on a schema page, schema links on Home */
  nav?: ReactNode;
  children: ReactNode;
  /** desktop: right column. `pinned` stays put (3D view), `scroll` scrolls on its own (QR, exports) */
  aside?: { pinned?: ReactNode; scroll?: ReactNode };
};

/**
 * The frame of every page: header and nav on top, then the content.
 * Desktop: fixed height, main and the aside's lower part scroll separately, width depends on the
 * screen only. Phones: one scrolling page, header and nav sticky, pinned part first.
 */
export function Shell({ crumbs, nav, children, aside }: Props) {
  return (
    <div className={`shell${aside ? " has-aside" : ""}`}>
      <div className="shell-head">
        <Header crumbs={crumbs} />
        {nav && <div className="shell-nav">{nav}</div>}
      </div>
      <div className="shell-body">
        {aside?.pinned && <div className="aside-pin">{aside.pinned}</div>}
        <main className="pane main-pane">{children}</main>
        {aside?.scroll && <div className="pane aside-pane">{aside.scroll}</div>}
      </div>
    </div>
  );
}
