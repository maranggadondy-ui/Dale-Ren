import { Plus, Search, Trash2, X } from "lucide-react";
import type { NoteSession } from "../types";

interface SessionsSidebarProps {
  notes: NoteSession[];
  activeNoteId: string;
  searchQuery: string;
  mobileOpen: boolean;
  onSearchChange: (q: string) => void;
  onSelectNote: (id: string) => void;
  onCreateNote: () => void;
  onDeleteNote: (id: string) => void;
  onCloseMobile: () => void;
}

export function SessionsSidebar({
  notes,
  activeNoteId,
  searchQuery,
  mobileOpen,
  onSearchChange,
  onSelectNote,
  onCreateNote,
  onDeleteNote,
  onCloseMobile,
}: SessionsSidebarProps) {
  const q = searchQuery.trim().toLowerCase();
  const filtered = notes.filter(
    (n) =>
      n.title.toLowerCase().includes(q) ||
      n.transcript.toLowerCase().includes(q) ||
      n.grammarCorrected.toLowerCase().includes(q) ||
      n.execSummary.toLowerCase().includes(q)
  );

  return (
    <>
      {mobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-30 lg:hidden"
        />
      )}

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-72 xl:w-[272px] bg-white dark:bg-[#101622] border-r border-slate-200 dark:border-slate-800 flex flex-col transform transition-transform duration-200 ease-out pt-14 lg:pt-0 shrink-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onCreateNote}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Session</span>
          </button>
          <button
            type="button"
            onClick={onCloseMobile}
            className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close sessions sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 border-b border-slate-200/70 dark:border-slate-800/80">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search transcripts & notes..."
              className="w-full pl-8 pr-3 py-2 text-xs rounded-lg bg-slate-100 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 border border-transparent focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-colors"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2.5 space-y-1">
          {filtered.length === 0 ? (
            <div className="text-center py-8 px-4 text-xs text-slate-500 dark:text-slate-400">
              No matching sessions found.
            </div>
          ) : (
            filtered.map((note) => {
              const isActive = note.id === activeNoteId;
              const dateStr = new Date(note.createdAt).toLocaleDateString(
                undefined,
                { month: "short", day: "numeric" }
              );
              const preview = (
                note.execSummary ||
                note.grammarCorrected ||
                note.transcript ||
                "Empty session"
              ).slice(0, 72);
              const fixCount = note.grammarFixes?.length ?? 0;

              return (
                <div
                  key={note.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    onSelectNote(note.id);
                    onCloseMobile();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectNote(note.id);
                      onCloseMobile();
                    }
                  }}
                  className={`group relative p-3 rounded-lg cursor-pointer border transition-colors ${
                    isActive
                      ? "bg-indigo-50/90 dark:bg-indigo-950/35 border-indigo-200 dark:border-indigo-500/40"
                      : "bg-transparent hover:bg-slate-100/70 dark:hover:bg-slate-800/50 border-transparent"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h4
                      className={`text-xs font-semibold truncate ${
                        isActive
                          ? "text-indigo-700 dark:text-indigo-300"
                          : "text-slate-800 dark:text-slate-200"
                      }`}
                    >
                      {note.title || "Untitled Session"}
                    </h4>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteNote(note.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded text-slate-400 hover:text-rose-500 transition-opacity cursor-pointer"
                      title="Delete session"
                      aria-label={`Delete ${note.title || "session"}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-1 leading-relaxed">
                    {preview}
                  </p>

                  <div className="flex items-center gap-1.5 mt-2 text-[11px] font-mono tabular-nums text-slate-400 dark:text-slate-500">
                    <span>{dateStr}</span>
                    <span aria-hidden="true">·</span>
                    <span>{note.duration || "00:00"}</span>
                    {fixCount > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                          {fixCount} {fixCount === 1 ? "fix" : "fixes"}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
          <span className="tabular-nums">
            {notes.length} saved {notes.length === 1 ? "session" : "sessions"}
          </span>
          <span>Local Storage</span>
        </div>
      </aside>
    </>
  );
}
