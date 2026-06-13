import type { ReactNode } from "react";

export type ViewerContentMode =
  | "centered-panel"
  | "padded-scroll"
  | "edge-to-edge"
  | "embed";

export type ViewerChromePolicy =
  | "framed"
  | "edge-to-edge"
  | "hostless-exception";

export interface ViewerFrameDescriptor {
  readonly chromePolicy: ViewerChromePolicy;
  readonly contentMode: ViewerContentMode;
  readonly eyebrow?: string;
  readonly title: string;
  readonly subtitle?: string;
}

export interface ViewerFrameAction {
  readonly id: string;
  readonly label: string;
  readonly icon?: "back" | "close" | "external" | "download" | "save";
  readonly onClick: () => void;
}

export interface ViewerFrameButtonAction extends ViewerFrameAction {
  readonly testId?: string;
}

export interface ViewerWidgetFrameProps extends ViewerFrameDescriptor {
  readonly widgetId: string;
  readonly active?: boolean;
  readonly closeAction?: ViewerFrameAction;
  readonly primaryAction?: ViewerFrameButtonAction;
  readonly secondaryActions?: readonly ViewerFrameButtonAction[];
  readonly loading?: { readonly label: string } | null;
  readonly status?: ReactNode;
  readonly children: ReactNode;
}

export interface DescribedViewerFrame {
  readonly id: string;
  readonly viewerFrame: ViewerFrameDescriptor;
}

export function framePropsFromDescriptor(
  descriptor: DescribedViewerFrame,
  props: Omit<ViewerWidgetFrameProps, keyof ViewerFrameDescriptor | "widgetId">,
): ViewerWidgetFrameProps {
  return {
    widgetId: descriptor.id,
    ...descriptor.viewerFrame,
    ...props,
  };
}
