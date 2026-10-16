// Lucide stroke icons, inline SVG. Decorative by default (aria-hidden): the
// accessible name belongs on the button or label that holds the icon.
import React from 'react';
import {
  ClipboardList as ClipboardListBase,
  LayoutGrid as LayoutGridBase,
  Map as MapBase,
  FlaskConical as FlaskConicalBase,
  Settings as SettingsBase,
  Bot as BotBase,
  Wrench as WrenchBase,
  Hand as HandBase,
  CircleHelp as CircleHelpBase,
  Lock as LockBase,
  Trash2 as Trash2Base,
  Link as LinkBase,
  FolderOpen as FolderOpenBase,
  Upload as UploadBase,
  TriangleAlert as TriangleAlertBase,
  Check as CheckBase,
  Monitor as MonitorBase,
  Sun as SunBase,
  Moon as MoonBase,
  GripVertical as GripVerticalBase,
} from 'lucide-react';

const decorative = (Base, name) => {
  const Icon = (props) => <Base aria-hidden="true" focusable="false" strokeWidth={2} {...props} />;
  Icon.displayName = name;
  return Icon;
};

export const ClipboardList = decorative(ClipboardListBase, 'ClipboardList');
export const LayoutGrid = decorative(LayoutGridBase, 'LayoutGrid');
export const MapIcon = decorative(MapBase, 'MapIcon');
export const FlaskConical = decorative(FlaskConicalBase, 'FlaskConical');
export const SettingsIcon = decorative(SettingsBase, 'SettingsIcon');
export const Bot = decorative(BotBase, 'Bot');
export const Wrench = decorative(WrenchBase, 'Wrench');
export const Hand = decorative(HandBase, 'Hand');
export const CircleHelp = decorative(CircleHelpBase, 'CircleHelp');
export const Lock = decorative(LockBase, 'Lock');
export const Trash2 = decorative(Trash2Base, 'Trash2');
export const LinkIcon = decorative(LinkBase, 'LinkIcon');
export const FolderOpen = decorative(FolderOpenBase, 'FolderOpen');
export const Upload = decorative(UploadBase, 'Upload');
export const TriangleAlert = decorative(TriangleAlertBase, 'TriangleAlert');
export const Check = decorative(CheckBase, 'Check');
export const Monitor = decorative(MonitorBase, 'Monitor');
export const Sun = decorative(SunBase, 'Sun');
export const Moon = decorative(MoonBase, 'Moon');
export const GripVertical = decorative(GripVerticalBase, 'GripVertical');

// Resource type -> icon, shared by every place that shows a card's resource
export const RESOURCE_ICONS = {
  claude_sub: Bot,
  anthropic_api: Wrench,
  none: Hand,
  tbc: CircleHelp,
};

export const ResourceIcon = ({ resource, ...props }) => {
  const Icon = RESOURCE_ICONS[resource];
  return Icon ? <Icon {...props} /> : null;
};
