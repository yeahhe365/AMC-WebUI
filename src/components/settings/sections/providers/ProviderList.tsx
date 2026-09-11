import React, { useMemo, useState } from 'react';
import { Search, Filter, Plus, GripVertical, MoreVertical, Edit, Copy, Trash2, Activity, Check, X } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GEMINI_PROVIDER_ID, type ThirdPartyConnection } from '@/types';
import { useI18n } from '@/contexts/I18nContext';
import { ProviderAvatar } from './ProviderAvatar';

interface ProviderListProps {
  connections: ThirdPartyConnection[];
  selectedConnectionId: string | null;
  onSelectConnection: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
  onAddConnection: () => void;
  onEditConnection: (connection: ThirdPartyConnection) => void;
  onDuplicateConnection: (connection: ThirdPartyConnection) => void;
  onDeleteConnection: (id: string) => void;
  onProbeConnection: (connection: ThirdPartyConnection) => void;
  geminiStatus?: {
    isConfigured: boolean;
    useProxy: boolean;
  };
}

interface SortableProviderItemProps {
  connection: ThirdPartyConnection;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onProbe: () => void;
  t: (key: string) => string;
}

const SortableProviderItem: React.FC<SortableProviderItemProps> = ({
  connection,
  isSelected,
  onSelect,
  onEdit,
  onDuplicate,
  onDelete,
  onProbe,
  t,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: connection.id });

  const [menuOpen, setMenuOpen] = useState(false);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : 'auto',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={`group relative flex items-center justify-between gap-2 px-2.5 py-2.5 rounded-xl cursor-pointer select-none transition-all ${
        isSelected
          ? 'bg-[var(--theme-bg-secondary)] shadow-xs ring-1 ring-[var(--theme-border-focus)]/40 font-medium'
          : 'hover:bg-[var(--theme-bg-secondary)]/50'
      } ${isDragging ? 'opacity-50 shadow-lg' : ''}`}
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <button
          type="button"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="cursor-grab active:cursor-grabbing text-[var(--theme-text-secondary)]/40 hover:text-[var(--theme-text-secondary)] opacity-0 group-hover:opacity-100 transition-opacity p-0.5 -ml-1 focus:outline-none"
          aria-label="Drag to reorder"
        >
          <GripVertical size={15} />
        </button>

        <ProviderAvatar name={connection.name} templateId={connection.templateId} size={26} />

        <span
          className={`text-sm truncate min-w-0 flex-1 ${
            isSelected
              ? 'text-[var(--theme-text-primary)] font-semibold'
              : connection.enabled
                ? 'text-[var(--theme-text-primary)]'
                : 'text-[var(--theme-text-secondary)] line-through opacity-70'
          }`}
          title={connection.name}
        >
          {connection.name}
        </span>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        {connection.enabled ? (
          <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-xs" title={t('enabled')} />
        ) : (
          <span className="w-2 h-2 rounded-full bg-[var(--theme-border-secondary)] opacity-40" title={t('disabled')} />
        )}

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1 rounded-md text-[var(--theme-text-secondary)]/60 hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 focus:outline-none"
          >
            <MoreVertical size={14} />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-40 w-36 rounded-xl border border-[var(--theme-border-primary)] bg-[var(--theme-bg-primary)] p-1 shadow-xl text-xs space-y-0.5 animate-in fade-in duration-100">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onProbe();
                  }}
                  className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-left text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)]"
                >
                  <Activity size={13} />
                  <span>{t('thirdPartyTestSpeed')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onEdit();
                  }}
                  className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-left text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)]"
                >
                  <Edit size={13} />
                  <span>{t('edit')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onDuplicate();
                  }}
                  className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-left text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)]"
                >
                  <Copy size={13} />
                  <span>{t('thirdPartyDuplicate')}</span>
                </button>
                <div className="h-[1px] bg-[var(--theme-border-secondary)]/30 my-0.5" />
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete();
                  }}
                  className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-left text-[var(--theme-text-danger)] hover:bg-[var(--theme-bg-danger)]/10"
                >
                  <Trash2 size={13} />
                  <span>{t('delete')}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export const ProviderList: React.FC<ProviderListProps> = ({
  connections,
  selectedConnectionId,
  onSelectConnection,
  onReorder,
  onAddConnection,
  onEditConnection,
  onDuplicateConnection,
  onDeleteConnection,
  onProbeConnection,
  geminiStatus,
}) => {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const filteredConnections = useMemo(() => {
    return connections
      .filter((conn) => {
        if (filterMode === 'enabled') return conn.enabled;
        if (filterMode === 'disabled') return !conn.enabled;
        return true;
      })
      .filter((conn) => {
        if (!search.trim()) return true;
        const q = search.trim().toLowerCase();
        return conn.name.toLowerCase().includes(q) || conn.models.some((m) => m.id.toLowerCase().includes(q));
      });
  }, [connections, filterMode, search]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = connections.findIndex((c) => c.id === active.id);
      const newIndex = connections.findIndex((c) => c.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        const next = [...connections];
        const [moved] = next.splice(oldIndex, 1);
        next.splice(newIndex, 0, moved);
        onReorder(next.map((c) => c.id));
      }
    }
  };

  const isGeminiMatch =
    !search ||
    'google gemini official builtin 官方 内置'.toLowerCase().includes(search.toLowerCase()) ||
    t('thirdPartyOfficialProviders').toLowerCase().includes(search.toLowerCase());

  return (
    <div className="w-full md:w-64 lg:w-72 flex flex-col h-full bg-[var(--theme-bg-secondary)]/25 border-r border-[var(--theme-border-secondary)]/40 flex-shrink-0 select-none">
      <div className="p-3 border-b border-[var(--theme-border-secondary)]/30 flex-shrink-0 flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--theme-text-secondary)]/60 pointer-events-none"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('thirdPartySearchPlaceholder')}
            className="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl border border-[var(--theme-border-secondary)]/60 bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] placeholder:text-[var(--theme-text-secondary)]/50 focus:outline-none focus:ring-1 focus:ring-[var(--theme-border-focus)] transition-colors"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] transition-colors"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setFilterMenuOpen(!filterMenuOpen)}
            className={`p-1.5 rounded-lg border transition-colors ${
              filterMode !== 'all'
                ? 'border-[var(--theme-border-focus)] bg-[var(--theme-border-focus)]/10 text-[var(--theme-text-focus)]'
                : 'border-[var(--theme-border-secondary)]/60 bg-[var(--theme-bg-primary)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'
            }`}
            title={t('thirdPartyFilterStatus')}
          >
            <Filter size={13} />
          </button>

          {filterMenuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setFilterMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-40 w-32 rounded-xl border border-[var(--theme-border-primary)] bg-[var(--theme-bg-primary)] p-1 shadow-xl text-xs space-y-0.5">
                {[
                  { id: 'all', label: t('thirdPartyFilterAll') },
                  { id: 'enabled', label: t('thirdPartyFilterEnabled') },
                  { id: 'disabled', label: t('thirdPartyFilterDisabled') },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setFilterMode(item.id as any);
                      setFilterMenuOpen(false);
                    }}
                    className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-left text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)]"
                  >
                    <span>{item.label}</span>
                    {filterMode === item.id && <Check size={13} className="text-emerald-500" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-3">
        {isGeminiMatch && (
          <div className="space-y-1">
            <div className="px-2 py-0.5 text-[10px] font-semibold tracking-wider text-[var(--theme-text-secondary)]/60 uppercase">
              {t('thirdPartyOfficialProviders')}
            </div>
            <div
              onClick={() => onSelectConnection(GEMINI_PROVIDER_ID)}
              className={`group relative flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-xl cursor-pointer select-none transition-all ${
                selectedConnectionId === GEMINI_PROVIDER_ID
                  ? 'bg-[var(--theme-bg-secondary)] shadow-xs ring-1 ring-[var(--theme-border-focus)]/40 font-medium'
                  : 'hover:bg-[var(--theme-bg-secondary)]/50'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <ProviderAvatar name="Google Gemini" templateId="gemini" size={26} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm truncate font-semibold text-[var(--theme-text-primary)]">
                      Google Gemini
                    </span>
                    <span className="px-1.5 py-0.2 text-[9px] font-medium rounded-full bg-blue-500/15 text-blue-500 shrink-0">
                      {t('thirdPartyBuiltin')}
                    </span>
                  </div>
                  <div className="text-[10px] text-[var(--theme-text-secondary)]/70 truncate mt-0.5">
                    {geminiStatus?.useProxy ? t('thirdPartyCustomProxyEndpoint') : t('thirdPartyOfficialEndpoint')}
                  </div>
                </div>
              </div>
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  geminiStatus?.isConfigured ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
                title={geminiStatus?.isConfigured ? t('thirdPartyReady') : t('thirdPartyPendingKey')}
              />
            </div>
          </div>
        )}

        <div className="space-y-1">
          <div className="flex items-center justify-between px-2 py-0.5">
            <span className="text-[10px] font-semibold tracking-wider text-[var(--theme-text-secondary)]/60 uppercase">
              {t('thirdPartyProvidersList')}
            </span>
            <span className="text-[10px] text-[var(--theme-text-secondary)]/50 font-mono">({connections.length})</span>
          </div>

          {filteredConnections.length === 0 ? (
            <div className="py-6 px-2 text-center text-xs text-[var(--theme-text-secondary)]">
              {search ? t('thirdPartyNoSearchResults') : t('thirdPartyConnectionsEmpty')}
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={filteredConnections.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                {filteredConnections.map((connection) => (
                  <SortableProviderItem
                    key={connection.id}
                    connection={connection}
                    isSelected={connection.id === selectedConnectionId}
                    onSelect={() => onSelectConnection(connection.id)}
                    onEdit={() => onEditConnection(connection)}
                    onDuplicate={() => onDuplicateConnection(connection)}
                    onDelete={() => onDeleteConnection(connection.id)}
                    onProbe={() => onProbeConnection(connection)}
                    t={t}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      <div className="p-3 border-t border-[var(--theme-border-secondary)]/30 flex-shrink-0 bg-[var(--theme-bg-primary)]/40">
        <button
          type="button"
          data-settings-item="providers-add"
          onClick={onAddConnection}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-dashed border-[var(--theme-border-secondary)] hover:border-[var(--theme-border-focus)] bg-[var(--theme-bg-secondary)]/50 hover:bg-[var(--theme-bg-tertiary)]/70 text-xs font-medium text-[var(--theme-text-primary)] transition-all cursor-pointer shadow-xs"
        >
          <Plus size={14} />
          <span>{t('thirdPartyAddConnection')}</span>
        </button>
      </div>
    </div>
  );
};
