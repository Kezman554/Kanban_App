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
  X as XBase,
  Play as PlayBase,
  Layers as LayersBase,
  Folder as FolderBase,
  Copy as CopyBase,
  Maximize2 as Maximize2Base,
  ChevronDown as ChevronDownBase,
  ChevronRight as ChevronRightBase,
  ClipboardCopy as ClipboardCopyBase,
  Plus as PlusBase,
  Pencil as PencilBase,
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
export const X = decorative(XBase, 'X');
export const Play = decorative(PlayBase, 'Play');
export const Layers = decorative(LayersBase, 'Layers');
export const Folder = decorative(FolderBase, 'Folder');
export const Copy = decorative(CopyBase, 'Copy');
export const Maximize2 = decorative(Maximize2Base, 'Maximize2');
export const ChevronDown = decorative(ChevronDownBase, 'ChevronDown');
export const ChevronRight = decorative(ChevronRightBase, 'ChevronRight');
export const ClipboardCopy = decorative(ClipboardCopyBase, 'ClipboardCopy');
export const Plus = decorative(PlusBase, 'Plus');
export const Pencil = decorative(PencilBase, 'Pencil');

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
