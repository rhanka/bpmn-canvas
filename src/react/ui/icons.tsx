import type { ReactElement, SVGProps } from "react";

type IconProps = Omit<SVGProps<SVGSVGElement>, "children" | "d">;

function Svg(props: IconProps & { d: string; extra?: string }): ReactElement {
  const { d, extra, ...rest } = props;
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
      <path d={d} />
      {extra ? <path d={extra} /> : null}
    </svg>
  );
}

export const IconUndo = (p: IconProps): ReactElement => <Svg d="M6 3 3 6l3 3" extra="M3 6h6a4 4 0 0 1 0 8H6" {...p} />;
export const IconRedo = (p: IconProps): ReactElement => <Svg d="m10 3 3 3-3 3" extra="M13 6H7a4 4 0 0 0 0 8h3" {...p} />;
export const IconZoomIn = (p: IconProps): ReactElement => <Svg d="M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10Zm4.5 1.5L14 14" extra="M7 5v4M5 7h4" {...p} />;
export const IconZoomOut = (p: IconProps): ReactElement => <Svg d="M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10Zm4.5 1.5L14 14" extra="M5 7h4" {...p} />;
export const IconFit = (p: IconProps): ReactElement => <Svg d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" extra="M6 6h4v4H6z" {...p} />;
export const IconLayout = (p: IconProps): ReactElement => <Svg d="M2 3h5v4H2zM9 9h5v4H9z" extra="M7 5h2a1 1 0 0 1 1 1v3" {...p} />;
export const IconDownload = (p: IconProps): ReactElement => <Svg d="M8 2v8m0 0L5 7m3 3 3-3" extra="M3 13h10" {...p} />;
export const IconUpload = (p: IconProps): ReactElement => <Svg d="M8 10V2m0 0L5 5m3-3 3 3" extra="M3 13h10" {...p} />;
export const IconChevronDown = (p: IconProps): ReactElement => <Svg d="m4 6 4 4 4-4" {...p} />;
export const IconFormat = (p: IconProps): ReactElement => <Svg d="M2 4h12M2 8h8M2 12h12" extra="M12 7l2 1-2 1" {...p} />;
export const IconCheck = (p: IconProps): ReactElement => <Svg d="m3 8.5 3.2 3L13 4.5" {...p} />;

// Same icons under the `<Name>Icon` convention.
export const UndoIcon = IconUndo;
export const RedoIcon = IconRedo;
export const ZoomInIcon = IconZoomIn;
export const ZoomOutIcon = IconZoomOut;
export const FitIcon = IconFit;
export const LayoutIcon = IconLayout;
export const DownloadIcon = IconDownload;
export const UploadIcon = IconUpload;
export const ChevronDownIcon = IconChevronDown;
export const FormatIcon = IconFormat;
export const CheckIcon = IconCheck;
