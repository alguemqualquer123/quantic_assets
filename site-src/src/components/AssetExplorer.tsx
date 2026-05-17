import React, { useEffect, useState } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
    Folder,
    FileText,
    Search,
    Home,
    ChevronRight,
    Copy,
    Link as LinkIcon,
    Download,
    Check,
    X,
    Maximize2,
    SlidersHorizontal,
    SortAsc,
    RefreshCw,
    Music,
    Play,
    List,
    Grid3X3,
    Filter
} from 'lucide-react';


import { VirtuosoGrid } from 'react-virtuoso';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const calculateFolderSize = (node: AssetNode): number => {
  if (node.type === 'file' && node.size) return node.size;
  if (node.type === 'directory' && node.children) {
    return node.children.reduce((total, child) => total + calculateFolderSize(child), 0);
  }
  return 0;
};

// Types based on generate_manifest.py
interface AssetNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  children?: AssetNode[];
}

interface Manifest {
  root: AssetNode[];
  generated_at: number;
}

interface VisibleAssetNode extends AssetNode {
  fullPath: string[];
  depth: number;
}

type ViewMode = 'all' | 'folders' | 'images' | 'files';
type SortMode = 'name' | 'size' | 'type';
type SearchMode = 'current' | 'recursive';
type DisplayMode = 'grid' | 'list';
type PreviewType = 'image' | 'video' | 'audio' | null;

const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|svg)$/i;
const TEXT_EXTENSIONS = /\.(json|txt|csv|md|xml|yml|yaml|log|ini|toml)$/i;
const AUDIO_EXTENSIONS = /\.(mp3|wav|ogg|m4a)$/i;
const VIDEO_EXTENSIONS = /\.(mp4|webm|mov|avi)$/i;

const isImageFile = (name: string) => IMAGE_EXTENSIONS.test(name);
const isTextFile = (name: string) => TEXT_EXTENSIONS.test(name);
const isAudioFile = (name: string) => AUDIO_EXTENSIONS.test(name);
const isVideoFile = (name: string) => VIDEO_EXTENSIONS.test(name);

const getFilePriority = (name: string) => {
    if (name.endsWith('.webp')) return 0;
    if (name.endsWith('.png')) return 1;
    if (name.endsWith('.jpg')) return 2;
    if (name.endsWith('.jpeg')) return 3;
    return 4;
};

export const AssetExplorer: React.FC = () => {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [currentPath, setCurrentPath] = useState<string[]>([]);
  const [currentNode, setCurrentNode] = useState<AssetNode[] | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [sortMode, setSortMode] = useState<SortMode>('name');
  const [searchMode, setSearchMode] = useState<SearchMode>('recursive');
  const [copiedState, setCopiedState] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<{path: string, name: string, type: PreviewType} | null>(null);
  const [displayMode, setDisplayMode] = useState<DisplayMode>('grid');
  const [extensionFilter, setExtensionFilter] = useState<string>('');
  const resolveAssetUrl = (assetPath: string) => `${import.meta.env.BASE_URL}${assetPath}`.replace(/\/{2,}/g, '/').replace(':/', '://');

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}manifest.json`)
      .then(res => res.json())
      .then((data: Manifest) => {
        setManifest(data);
        setCurrentNode(data.root);
      })
      .catch(err => console.error("Failed to load manifest", err));
  }, []);

  const resolvePath = (segments: string[]) => {
      if (!manifest) return null;

      let nodes = manifest.root;

      for (const segment of segments) {
          const folder = nodes.find(n => n.name === segment && n.type === 'directory');
          if (!folder || !folder.children) return null;
          nodes = folder.children;
      }

      return nodes;
  };

  const navigateToPath = (segments: string[]) => {
      if (!manifest) return;

      const nodes = resolvePath(segments);
      if (!nodes) return;

      setCurrentPath(segments);
      setCurrentNode(nodes);
      setSearchQuery('');
  };

  const navigateUp = (levelIndex: number) => {
      const newPath = currentPath.slice(0, levelIndex + 1);
      navigateToPath(newPath);
  };

  const navigateRoot = () => {
      if (!manifest) return;
      setCurrentPath([]);
      setCurrentNode(manifest.root);
      setSearchQuery('');
  }

  const resetView = () => {
      setSearchQuery('');
      setViewMode('all');
      setSortMode('name');
      setSearchMode('recursive');
      setExtensionFilter('');
      setDisplayMode('grid');
  };

  const copyToClipboard = (text: string, id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      navigator.clipboard.writeText(text).then(() => {
          setCopiedState(id);
          setTimeout(() => setCopiedState(null), 2000);
      });
  }

  // Handle ESC key to close preview
  useEffect(() => {
      const handleEsc = (e: KeyboardEvent) => {
          if (e.key === 'Escape') setPreviewFile(null);
      };
      window.addEventListener('keydown', handleEsc);
      return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  if (!manifest) return <div className="min-h-screen flex items-center justify-center text-zinc-400">Carregando arquivos...</div>;
  if (!currentNode) return <div className="min-h-screen flex items-center justify-center text-zinc-400">Iniciando...</div>;

  // Deduplication and Filtering Logic
  const processNodes = (
      nodes: AssetNode[],
      query: string,
      basePath: string[] = [],
      scope: SearchMode = 'recursive'
  ): VisibleAssetNode[] => {
      const normalizedQuery = query.trim().toLowerCase();

      const enrich = (item: AssetNode, pathPrefix: string[], depth: number): VisibleAssetNode => ({
          ...item,
          fullPath: [...pathPrefix, item.name],
          depth
      });

      const applyViewMode = (items: VisibleAssetNode[]) => items.filter(item => {
          if (viewMode === 'folders') return item.type === 'directory';
          if (viewMode === 'images') return item.type === 'file' && isImageFile(item.name);
          if (viewMode === 'files') return item.type === 'file';
          if (extensionFilter && item.type === 'file') {
              const ext = item.name.split('.').pop()?.toLowerCase() || '';
              return ext === extensionFilter.toLowerCase();
          }
          return true;
      });

      const sortItems = (items: VisibleAssetNode[]) => {
          return [...items].sort((a, b) => {
              if (sortMode === 'size') {
                  const diff = calculateFolderSize(b) - calculateFolderSize(a);
                  if (diff !== 0) return diff;
                  return a.name.localeCompare(b.name);
              }

              if (sortMode === 'type') {
                  if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
                  if (a.type === 'file' && b.type === 'file') {
                      const extA = a.name.split('.').pop()?.toLowerCase() || '';
                      const extB = b.name.split('.').pop()?.toLowerCase() || '';
                      const extDiff = extA.localeCompare(extB);
                      if (extDiff !== 0) return extDiff;
                  }
              }

              return a.name.localeCompare(b.name);
          });
      };

      if (normalizedQuery) {
          const matches: VisibleAssetNode[] = [];

          const walk = (items: AssetNode[], pathPrefix: string[], depth: number) => {
              items.forEach(item => {
                  const fullPath = [...pathPrefix, item.name];
                  const haystack = `${item.name} ${item.path}`.toLowerCase();

                  if (haystack.includes(normalizedQuery)) {
                      matches.push(enrich(item, pathPrefix, depth));
                  }

                  if (scope === 'recursive' && item.type === 'directory' && item.children) {
                      walk(item.children, fullPath, depth + 1);
                  }
              });
          };

          walk(nodes, basePath, 0);
          return sortItems(applyViewMode(matches));
      }

      const directories = nodes
          .filter(n => n.type === 'directory')
          .map(item => enrich(item, basePath, basePath.length));

      const files = nodes.filter(n => n.type === 'file');
      const fileGroups: Record<string, AssetNode[]> = {};

      files.forEach(file => {
          const lastDotIndex = file.name.lastIndexOf('.');
          const baseName = lastDotIndex !== -1 ? file.name.substring(0, lastDotIndex) : file.name;
          if (!fileGroups[baseName]) {
              fileGroups[baseName] = [];
          }
          fileGroups[baseName].push(file);
      });

      const uniqueFiles: VisibleAssetNode[] = [];
      Object.values(fileGroups).forEach(group => {
          if (group.length === 1) {
              uniqueFiles.push(enrich(group[0], basePath, basePath.length));
              return;
          }

          group.sort((a, b) => getFilePriority(a.name) - getFilePriority(b.name));
          uniqueFiles.push(enrich(group[0], basePath, basePath.length));
      });

      return sortItems(applyViewMode([...directories, ...uniqueFiles]));
  };

  const visibleItems = processNodes(currentNode, searchQuery, currentPath, searchMode);
  const folderCount = visibleItems.filter(i => i.type === 'directory').length;
  const fileCount = visibleItems.filter(i => i.type === 'file').length;
  const imageCount = visibleItems.filter(i => i.type === 'file' && isImageFile(i.name)).length;
  const totalSize = visibleItems.reduce((sum, item) => sum + calculateFolderSize(item), 0);

  return (
    <div className="w-full min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-red-500/30">
        {/* Sticky Header */}
      <header className="sticky top-0 z-50 w-full border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-xl supports-[backdrop-filter]:bg-zinc-950/60">
        <div className="w-full max-w-[1920px] mx-auto px-6 h-16 flex items-center justify-between gap-4">
            <h1 className="text-xl font-bold flex items-center gap-2 tracking-tight">
                <span className="text-red-500">Fênix</span>
                <span className="text-zinc-200">Development</span>
            </h1>

            <div className="flex items-center gap-2">
                <button
                    onClick={resetView}
                    className="hidden md:inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-xs font-medium text-zinc-300 hover:border-red-500/40 hover:text-white transition-colors"
                    title="Redefinir filtros"
                >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Redefinir
                </button>
            </div>
        </div>
      </header>

      <div className="max-w-[1920px] mx-auto p-6">

      <section className="mb-6 grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur-sm lg:grid-cols-[1.4fr_0.9fr_0.9fr_auto]">
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-red-500 transition-colors" />
          <input
              type="text"
              placeholder="Pesquisar nome ou caminho..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950/70 py-2.5 pl-10 pr-3 text-sm text-zinc-100 placeholder-zinc-600 focus:border-red-500/50 focus:outline-none focus:ring-4 focus:ring-red-500/10"
          />
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/70 p-1">
          {(['all', 'folders', 'images', 'files'] as ViewMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={cn(
                "flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                viewMode === mode
                  ? "bg-red-500 text-white"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
              )}
            >
              {mode === 'folders' ? 'Pastas' : mode === 'images' ? 'Imagens' : mode === 'files' ? 'Arquivos' : 'Tudo'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setSearchMode(prev => (prev === 'recursive' ? 'current' : 'recursive'))}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-colors",
              searchMode === 'recursive'
                ? "border-red-500/40 bg-red-500/10 text-red-300"
                : "border-zinc-800 bg-zinc-950/70 text-zinc-400 hover:text-zinc-100"
            )}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            {searchMode === 'recursive' ? 'Subpastas' : 'Atual'}
          </button>

          <label className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-xs text-zinc-400">
            <SortAsc className="w-3.5 h-3.5" />
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="w-full bg-transparent text-zinc-200 outline-none"
            >
              <option value="name">Nome</option>
              <option value="size">Tamanho</option>
              <option value="type">Tipo</option>
            </select>
          </label>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Filter className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Extensão..."
              value={extensionFilter}
              onChange={(e) => setExtensionFilter(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950/70 py-2 pl-8 pr-2 text-xs text-zinc-200 placeholder-zinc-600 focus:border-red-500/50 focus:outline-none"
            />
          </div>
          <div className="flex rounded-xl border border-zinc-800 bg-zinc-950/70 p-1">
            <button
              onClick={() => setDisplayMode('grid')}
              className={cn(
                "p-2 rounded-lg transition-colors",
                displayMode === 'grid' ? "bg-red-500 text-white" : "text-zinc-400 hover:text-white"
              )}
              title="Grade"
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setDisplayMode('list')}
              className={cn(
                "p-2 rounded-lg transition-colors",
                displayMode === 'list' ? "bg-red-500 text-white" : "text-zinc-400 hover:text-white"
              )}
              title="Lista"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-2 text-xs text-zinc-400 lg:justify-end">
          <span>{folderCount} pastas</span>
          <span>{fileCount} arquivos</span>
          <span>{imageCount} imagens</span>
          <span>{formatFileSize(totalSize)}</span>
        </div>
      </section>

      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-sm text-zinc-400 mb-6 bg-zinc-900 p-3 rounded-lg border border-zinc-800 overflow-x-auto scrollbar-hide">
        <button onClick={navigateRoot} className="hover:text-red-400 font-medium px-2 py-1 rounded hover:bg-zinc-800 transition-colors flex items-center gap-1">
             <Home className="w-4 h-4" /> Início
        </button>
        {currentPath.map((folder, index) => (
            <React.Fragment key={index}>
                <span className="text-zinc-600"><ChevronRight className="w-4 h-4" /></span>
                <button
                    onClick={() => navigateUp(index)}
                    className={cn(
                        "hover:text-red-400 px-2 py-1 rounded hover:bg-zinc-800 transition-colors whitespace-nowrap",
                        index === currentPath.length - 1 && "font-bold text-zinc-100"
                    )}
                >
                    {folder}
                </button>
            </React.Fragment>
        ))}
        <span className="ml-auto text-xs text-zinc-500 whitespace-nowrap pl-4 border-l border-zinc-800 h-4 flex items-center">
            {visibleItems.length} itens {searchQuery && "(filtrado)"}
        </span>
      </nav>

      {/* Content Grid with Virtuoso */}
      <VirtuosoGrid
        useWindowScroll
        totalCount={visibleItems.length}
        overscan={200}
        listClassName={cn("gap-4 mb-8", displayMode === 'grid' ? "grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8" : "grid grid-cols-1 max-w-4xl mx-auto")}
        itemContent={(index: number) => {
            const item = visibleItems[index];
            if (!item) return null; // Guard against potential out of bounds, though unlikely with totalCount

            if (item.type === 'directory') {
                return (
                    <div
                        onClick={() => navigateToPath(item.fullPath)}
                        className={cn(
                            "group cursor-pointer bg-zinc-900 border border-zinc-800 rounded-xl hover:bg-zinc-800 hover:border-red-500/50 transition-all relative select-none",
                            displayMode === 'grid' ? "p-4 flex flex-col items-center justify-center text-center gap-3 h-full" : "p-4 flex items-center gap-4"
                        )}
                        style={{ paddingLeft: `${16 + item.depth * 14}px`, paddingRight: '16px' }}
                    >
                        <div className="text-red-500/80 group-hover:text-red-400 transition-colors flex-shrink-0">
                        <Folder className={displayMode === 'grid' ? "w-10 h-10" : "w-8 h-8"} />
                        </div>
                        <div className={cn("flex flex-col gap-0.5 min-w-0", displayMode === 'grid' ? "items-center" : "flex-1")}>
                            <span className="font-medium truncate text-sm text-zinc-300 group-hover:text-white">{item.name}</span>
                            <span className="text-xs text-zinc-500">{item.children?.length || 0} itens</span>
                            <span className="text-[10px] text-zinc-600 font-mono bg-zinc-800/50 px-1.5 py-0.5 rounded">
                                {formatFileSize(calculateFolderSize(item))}
                            </span>
                            {searchQuery && (
                                <span className="text-[10px] text-zinc-500 font-mono truncate">
                                    {item.path}
                                </span>
                            )}
                        </div>
                    </div>
                );
            }

            // File Item
            const file = item;
            const isImage = isImageFile(file.name);
            const isText = isTextFile(file.name);
            const isAudio = isAudioFile(file.name);
            const isVideo = isVideoFile(file.name);
            const copyNameId = `name-${file.path}`;
            const copyPathId = `path-${file.path}`;

            return (
                <div className={cn(
                    "group relative bg-zinc-900 border border-zinc-800 rounded-xl hover:bg-zinc-800 hover:border-zinc-700 transition-all overflow-hidden",
                    displayMode === 'grid' ? "flex flex-col items-center gap-3 h-[280px] p-3" : "flex items-center gap-4 p-4"
                )}
                style={{ paddingLeft: `${12 + item.depth * 14}px`, paddingRight: '12px' }}
                >
                    {isImage ? (
                        <div
                            className={cn(
                                "bg-zinc-950 rounded-lg overflow-hidden flex items-center justify-center border border-zinc-800/50 cursor-pointer relative flex-shrink-0",
                                displayMode === 'grid' ? "w-full h-[170px]" : "w-16 h-16"
                            )}
                            onClick={() => setPreviewFile({path: file.path, name: file.name, type: 'image'})}
                        >
                            <img
                                src={resolveAssetUrl(file.path)}
                                alt={file.name}
                                loading="lazy"
                                className={cn("object-cover group-hover:scale-105 transition-transform duration-300", displayMode === 'grid' ? "w-full h-full" : "w-full h-full")}
                            />
                            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Maximize2 className="text-white w-6 h-6 drop-shadow-md" />
                            </div>
                        </div>
                    ) : isVideo ? (
                        <div
                            className={cn(
                                "bg-zinc-950 rounded-lg overflow-hidden flex items-center justify-center border border-zinc-800/50 cursor-pointer relative flex-shrink-0",
                                displayMode === 'grid' ? "w-full h-[170px]" : "w-16 h-16"
                            )}
                            onClick={() => setPreviewFile({path: file.path, name: file.name, type: 'video'})}
                        >
                            <video
                                src={resolveAssetUrl(file.path)}
                                className={cn("object-cover", displayMode === 'grid' ? "w-full h-full" : "w-full h-full")}
                                preload="metadata"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Play className="text-white w-8 h-8 drop-shadow-md" />
                            </div>
                        </div>
                    ) : isAudio ? (
                        <div className={cn(
                            "bg-zinc-950 rounded-lg flex items-center justify-center border border-zinc-800/50 flex-shrink-0",
                            displayMode === 'grid' ? "w-full h-[170px] flex-col gap-3 p-4" : "w-16 h-16"
                        )}>
                            <Music className={cn("text-purple-400", displayMode === 'grid' ? "w-10 h-10" : "w-8 h-8")} />
                            {displayMode === 'grid' && (
                                <audio controls className="w-full h-8">
                                    <source src={resolveAssetUrl(file.path)} />
                                </audio>
                            )}
                        </div>
                    ) : displayMode === 'grid' ? (
                        <div className="w-full h-[170px] bg-zinc-950 rounded-lg flex items-center justify-center text-zinc-700 border border-zinc-800/50 flex-shrink-0">
                            <FileText className="w-10 h-10" />
                        </div>
                    ) : (
                        <div className="w-16 h-16 bg-zinc-950 rounded-lg flex items-center justify-center text-zinc-700 border border-zinc-800/50 flex-shrink-0">
                            <FileText className="w-8 h-8" />
                        </div>
                    )}

                    <div className={cn("flex flex-col gap-1 min-h-0", displayMode === 'grid' ? "items-center mt-auto w-full" : "flex-1")}>
                        <span className={cn("font-medium truncate text-zinc-400 group-hover:text-zinc-200", displayMode === 'grid' ? "text-xs text-center flex-1" : "text-sm")} title={file.name}>
                            {file.name}
                        </span>
                        {(searchQuery || displayMode === 'list') && (
                            <span className="text-[10px] text-zinc-500 font-mono truncate" title={file.path}>
                                {file.path}
                            </span>
                        )}
                        <span className="text-[10px] text-zinc-500 font-mono bg-zinc-800/50 px-1.5 py-0.5 rounded">
                            {formatFileSize(file.size || 0)}
                        </span>
                    </div>

                    {/* Hover Actions */}
                    <div className={cn("flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10", displayMode === 'list' ? "absolute right-2 top-2 flex-col" : "absolute top-2 right-2 flex-col")}>
                        {(isText || isAudio || isVideo) && (
                            <a
                                href={resolveAssetUrl(file.path)}
                                target="_blank"
                                rel="noreferrer"
                                className="bg-black/80 hover:bg-red-600 text-white p-1.5 rounded-md shadow-lg backdrop-blur-sm transition-colors flex items-center justify-center"
                                title={isVideo || isAudio ? "Abrir" : "Abrir arquivo"}
                                onClick={(e) => e.stopPropagation()}
                            >
                                {(isAudio || isVideo) ? <Play className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                            </a>
                        )}
                        <button
                            onClick={(e) => copyToClipboard(file.name, copyNameId, e)}
                            className="bg-black/80 hover:bg-red-600 text-white p-1.5 rounded-md shadow-lg backdrop-blur-sm transition-colors"
                            title="Copiar Nome"
                        >
                            {copiedState === copyNameId ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                        <button
                            onClick={(e) => copyToClipboard(new URL(resolveAssetUrl(file.path), window.location.origin).href, copyPathId, e)}
                            className="bg-black/80 hover:bg-red-600 text-white p-1.5 rounded-md shadow-lg backdrop-blur-sm transition-colors"
                            title="Copiar Caminho"
                        >
                            {copiedState === copyPathId ? <Check className="w-3.5 h-3.5" /> : <LinkIcon className="w-3.5 h-3.5" />}
                        </button>
                        <a
                            href={resolveAssetUrl(file.path)}
                            download
                            className="bg-black/80 hover:bg-red-600 text-white p-1.5 rounded-md shadow-lg backdrop-blur-sm transition-colors flex items-center justify-center"
                            title="Baixar"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <Download className="w-3.5 h-3.5" />
                        </a>
                    </div>
                </div>
            );
        }}
    />

      {visibleItems.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-500 gap-4">
              <Folder className="w-12 h-12 opacity-20" />
              <p>Nenhum item encontrado.</p>
          </div>
      )}


      {/* Preview Modal */}
      {previewFile && (
        <div
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setPreviewFile(null)}
        >
            <button
                className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors z-10"
                onClick={() => setPreviewFile(null)}
            >
                <X className="w-8 h-8" />
            </button>
            <div
                className="max-w-full max-h-full relative"
                onClick={(e) => e.stopPropagation()}
            >
                {previewFile.type === 'video' ? (
                    <video
                        src={resolveAssetUrl(previewFile.path)}
                        controls
                        autoPlay
                        className="max-w-[90vw] max-h-[90vh] rounded-lg shadow-2xl"
                    />
                ) : previewFile.type === 'audio' ? (
                    <div className="bg-zinc-900 p-8 rounded-2xl shadow-2xl flex flex-col items-center gap-4">
                        <Music className="w-16 h-16 text-purple-400" />
                        <audio controls autoPlay className="w-[300px]">
                            <source src={resolveAssetUrl(previewFile.path)} />
                        </audio>
                        <span className="text-zinc-400 text-sm">{previewFile.name}</span>
                    </div>
                ) : (
                    <img
                        src={resolveAssetUrl(previewFile.path)}
                        alt={previewFile.name}
                        className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
                    />
                )}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-full text-sm backdrop-blur-md border border-white/10">
                    {previewFile.name}
                </div>
            </div>
        </div>
      )}
      </div>
    </div>
  );
};
