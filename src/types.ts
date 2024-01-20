import type { BaseLayoutProps } from "./layouts/base-layout/base-layout.kita";

export type PageWithBaseLayoutProps = Pick<BaseLayoutProps, "metadata"> &
  Partial<Pick<BaseLayoutProps, "language">>;
