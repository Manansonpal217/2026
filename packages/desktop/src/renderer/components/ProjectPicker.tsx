import { useState, useEffect, useRef } from 'react'
import { Search, ChevronDown, Folder, X, User, LayoutGrid, RefreshCw } from 'lucide-react'
import { InlineLoader, Skeleton } from './Loader'

const TASK_FILTER_KEY = 'task-filter-assigned'

function getStoredTaskFilter(): 'me' | 'all' {
  try {
    const stored = localStorage.getItem(TASK_FILTER_KEY)
    if (stored === 'me' || stored === 'all') return stored
  } catch {
    // ignore
  }
  return 'me'
}

export interface Project {
  id: string
  name: string
  color: string
  external_id?: string | null
}

export interface Task {
  id: string
  name: string
  status: string
  external_id?: string | null
  assignee_user_id?: string | null
}

function IntegrationIcon({ id }: { id: string | null | undefined }) {
  if (!id) return null
  if (id.startsWith('jira:')) return <span title="Jira" className="text-[10px] leading-none">🟦</span>
  if (id.startsWith('asana:')) return <span title="Asana" className="text-[10px] leading-none">🟧</span>
  return null
}

interface ProjectPickerProps {
  selectedProjectId: string | null
  selectedTaskId: string | null
  onProjectChange: (projectId: string | null, taskId: string | null) => void
  disabled?: boolean
  expanded?: boolean
  theme?: 'light' | 'dark'
}

export function ProjectPicker({
  selectedProjectId,
  selectedTaskId,
  onProjectChange,
  disabled,
  expanded = false,
  theme = 'dark',
}: ProjectPickerProps) {
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [isTaskOpen, setIsTaskOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [taskSearch, setTaskSearch] = useState('')
  const [taskFilter, setTaskFilter] = useState<'me' | 'all'>(getStoredTaskFilter)
  const [refreshing, setRefreshing] = useState(false)
  const [projectListExpanded, setProjectListExpanded] = useState(true)
  const [taskListExpanded, setTaskListExpanded] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)
  const taskContainerRef = useRef<HTMLDivElement>(null)

  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null
  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null

  useEffect(() => {
    loadProjects()
  }, [])

  useEffect(() => {
    if (selectedProjectId) {
      loadTasks(selectedProjectId, taskFilter)
      setTaskListExpanded(true)
    } else {
      setTasks([])
    }
  }, [selectedProjectId, taskFilter])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (containerRef.current && !containerRef.current.contains(target)) {
        setIsOpen(false)
        setSearch('')
      }
      if (taskContainerRef.current && !taskContainerRef.current.contains(target)) {
        setIsTaskOpen(false)
        setTaskSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function loadProjects() {
    setLoadingProjects(true)
    try {
      const list = (await window.electron?.ipcRenderer.invoke('projects:list')) as Project[]
      setProjects(list ?? [])
    } catch {
      setProjects([])
    } finally {
      setLoadingProjects(false)
    }
  }

  async function handleRefresh() {
    setRefreshing(true)
    const start = Date.now()
    try {
      const list = (await window.electron?.ipcRenderer.invoke('projects:list', true)) as Project[]
      setProjects(list ?? [])
      if (selectedProjectId) {
        await loadTasks(selectedProjectId, taskFilter)
      }
    } catch {
      // ignore
    } finally {
      const elapsed = Date.now() - start
      const minSpinMs = 400
      if (elapsed < minSpinMs) {
        await new Promise((r) => setTimeout(r, minSpinMs - elapsed))
      }
      setRefreshing(false)
    }
  }

  async function loadTasks(projectId: string, filter: 'me' | 'all') {
    setLoadingTasks(true)
    try {
      const list = (await window.electron?.ipcRenderer.invoke(
        'projects:tasks',
        projectId,
        filter,
      )) as Task[]
      setTasks(list ?? [])
    } catch {
      setTasks([])
    } finally {
      setLoadingTasks(false)
    }
  }

  function handleTaskFilterChange(filter: 'me' | 'all') {
    setTaskFilter(filter)
    try {
      localStorage.setItem(TASK_FILTER_KEY, filter)
    } catch {
      // ignore
    }
    if (selectedProjectId) {
      loadTasks(selectedProjectId, filter)
    }
  }

  const filtered = projects.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
  const filteredTasks = tasks.filter((t) => t.name.toLowerCase().includes(taskSearch.toLowerCase()))

  // Expanded layout: inline radio lists (no dropdowns)
  if (expanded) {
    const listBase = theme === 'dark'
      ? 'bg-white/[0.04] border-white/[0.06]'
      : 'bg-slate-100 border-slate-200'
    const rowBase = theme === 'dark'
      ? 'text-[#d1d5db] hover:bg-[rgba(255,255,255,0.04)]'
      : 'text-slate-700 hover:bg-slate-200'
    const rowSelected = theme === 'dark'
      ? 'bg-[rgba(99,102,241,0.15)] text-[#a5b4fc]'
      : 'bg-indigo-100 text-indigo-700'
    const searchInput = theme === 'dark'
      ? 'bg-transparent text-[#f9fafb] placeholder:text-[#6b7280]'
      : 'bg-transparent text-slate-800 placeholder:text-slate-500'

    return (
      <div ref={containerRef} className="flex flex-col h-full min-h-0 gap-4">
        {/* Project section */}
        <div className="flex flex-col shrink-0">
          <div className="flex items-center justify-between mb-2">
            <label className={`text-[10px] font-medium uppercase tracking-widest ${theme === 'dark' ? 'text-white/40' : 'text-slate-500'}`}>
              Project
            </label>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={disabled || refreshing}
              title="Refresh projects and tasks from server"
              className={[
                'p-1.5 rounded-lg transition-colors',
                theme === 'dark'
                  ? 'text-white/40 hover:text-white/70 hover:bg-white/[0.06]'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200',
                (disabled || refreshing) ? 'opacity-50 cursor-not-allowed' : '',
              ].join(' ')}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-loader-spin' : ''}`} />
            </button>
          </div>
          {loadingProjects && projects.length === 0 ? (
            <div className="h-24 rounded-xl overflow-hidden">
              <Skeleton className="h-full w-full" />
            </div>
          ) : !projectListExpanded ? (
            <button
              type="button"
              onClick={() => setProjectListExpanded(true)}
              className={[
                'w-full flex items-center gap-2.5 h-10 px-4 rounded-xl text-sm text-left transition-colors',
                theme === 'dark'
                  ? 'bg-white/[0.04] hover:bg-white/[0.07] text-white/90'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-800',
              ].join(' ')}
            >
              {selectedProject ? (
                <>
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: selectedProject.color }}
                  />
                  <span className="flex-1 truncate">{selectedProject.name}</span>
                  <IntegrationIcon id={selectedProject.external_id} />
                </>
              ) : (
                <>
                  <Folder className="h-4 w-4 text-[#6b7280] shrink-0" />
                  <span className={`flex-1 ${theme === 'dark' ? 'text-white/50' : 'text-slate-500'}`}>Select a project</span>
                </>
              )}
              <ChevronDown className="h-4 w-4 text-white/40 rotate-[-90deg]" />
            </button>
          ) : (
            <>
              <div className={`flex items-center gap-2 px-3 py-2 rounded-t-xl border border-b-0 ${listBase}`}>
                <Search className={`h-3.5 w-3.5 shrink-0 ${theme === 'dark' ? 'text-[#6b7280]' : 'text-slate-500'}`} />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search projects..."
                  className={`flex-1 text-sm outline-none ${searchInput}`}
                />
              </div>
              <div className={`overflow-y-auto max-h-[120px] rounded-b-xl border ${listBase}`}>
                <button
                  type="button"
                  onClick={() => {
                    onProjectChange(null, null)
                    setProjectListExpanded(false)
                    setSearch('')
                  }}
                  className={[
                    'w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors text-left',
                    !selectedProjectId ? rowSelected : rowBase,
                  ].join(' ')}
                >
                  <div className={`h-2.5 w-2.5 rounded-full border shrink-0 ${!selectedProjectId ? 'border-[rgba(99,102,241,0.5)]' : theme === 'dark' ? 'border-[rgba(255,255,255,0.3)]' : 'border-slate-400'}`} />
                  No project
                </button>
                {filtered.length === 0 ? (
                  <p className={`text-xs text-center py-4 ${theme === 'dark' ? 'text-[#6b7280]' : 'text-slate-500'}`}>
                    {projects.length === 0 ? 'No projects yet' : 'No results'}
                  </p>
                ) : (
                  filtered.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => {
                        onProjectChange(project.id, null)
                        setProjectListExpanded(false)
                        setSearch('')
                      }}
                      className={[
                        'w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors text-left',
                        selectedProjectId === project.id ? rowSelected : rowBase,
                      ].join(' ')}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: project.color }}
                      />
                      <span className="flex-1 truncate">{project.name}</span>
                      <IntegrationIcon id={project.external_id} />
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>

        {/* Task section — when project selected */}
        {selectedProjectId ? (
          <div ref={taskContainerRef} className="flex flex-col shrink-0 flex-1 min-h-0">
            <label className={`block text-[10px] font-medium uppercase tracking-widest mb-2 ${theme === 'dark' ? 'text-white/40' : 'text-slate-500'}`}>
              Task
            </label>
            <div
              className={[
                'flex shrink-0 rounded-2xl p-1 mb-2',
                theme === 'dark' ? 'bg-white/[0.04]' : 'bg-slate-100',
              ].join(' ')}
            >
              <button
                type="button"
                onClick={() => handleTaskFilterChange('me')}
                className={[
                  'flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-sm font-medium transition-all duration-200',
                  taskFilter === 'me'
                    ? theme === 'dark'
                      ? 'bg-white/10 text-white shadow-sm'
                      : 'bg-white text-slate-800 shadow-sm'
                    : theme === 'dark'
                      ? 'text-white/50 hover:text-white/70'
                      : 'text-slate-600 hover:text-slate-800',
                ].join(' ')}
              >
                <User className="h-3.5 w-3.5" />
                Assigned to me
              </button>
              <button
                type="button"
                onClick={() => handleTaskFilterChange('all')}
                className={[
                  'flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-sm font-medium transition-all duration-200',
                  taskFilter === 'all'
                    ? theme === 'dark'
                      ? 'bg-white/10 text-white shadow-sm'
                      : 'bg-white text-slate-800 shadow-sm'
                    : theme === 'dark'
                      ? 'text-white/50 hover:text-white/70'
                      : 'text-slate-600 hover:text-slate-800',
                ].join(' ')}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                All tasks
              </button>
            </div>
            {loadingTasks && tasks.length === 0 ? (
              <div className="h-20 rounded-xl overflow-hidden">
                <Skeleton className="h-full w-full" />
              </div>
            ) : !taskListExpanded ? (
              <button
                type="button"
                onClick={() => setTaskListExpanded(true)}
                className={[
                  'w-full flex items-center gap-2.5 h-10 px-4 rounded-xl text-sm text-left transition-colors',
                  theme === 'dark'
                    ? 'bg-white/[0.04] hover:bg-white/[0.07] text-white/90'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-800',
                ].join(' ')}
              >
                {selectedTask ? (
                  <>
                    <span className="h-2.5 w-2.5 rounded-full bg-[#6b7280]/50 shrink-0" />
                    <span className="flex-1 truncate">{selectedTask.name}</span>
                  </>
                ) : (
                  <>
                    <span className="h-2.5 w-2.5 rounded-full bg-[#6b7280]/50 shrink-0" />
                    <span className={`flex-1 ${theme === 'dark' ? 'text-white/50' : 'text-slate-500'}`}>Select a task</span>
                  </>
                )}
                <ChevronDown className="h-4 w-4 text-white/40 rotate-[-90deg]" />
              </button>
            ) : (
              <>
                <div className={`flex items-center gap-2 px-3 py-2 rounded-t-xl border border-b-0 ${listBase}`}>
                  <Search className={`h-3.5 w-3.5 shrink-0 ${theme === 'dark' ? 'text-[#6b7280]' : 'text-slate-500'}`} />
                  <input
                    type="text"
                    value={taskSearch}
                    onChange={(e) => setTaskSearch(e.target.value)}
                    placeholder="Search tasks..."
                    className={`flex-1 text-sm outline-none ${searchInput}`}
                  />
                </div>
                <div className={`overflow-y-auto max-h-[100px] rounded-b-xl border flex-1 min-h-0 ${listBase}`}>
                  <button
                    type="button"
                    onClick={() => {
                      onProjectChange(selectedProjectId, null)
                      setTaskListExpanded(false)
                      setTaskSearch('')
                    }}
                    className={[
                      'w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors text-left',
                      !selectedTaskId ? rowSelected : rowBase,
                    ].join(' ')}
                  >
                    <div className={`h-2.5 w-2.5 rounded-full border shrink-0 ${!selectedTaskId ? 'border-[rgba(99,102,241,0.5)]' : theme === 'dark' ? 'border-[rgba(255,255,255,0.3)]' : 'border-slate-400'}`} />
                    No task
                  </button>
                  {filteredTasks.length === 0 ? (
                    <p className={`text-xs text-center py-4 ${theme === 'dark' ? 'text-[#6b7280]' : 'text-slate-500'}`}>
                      {tasks.length === 0 ? 'No tasks yet' : 'No results'}
                    </p>
                  ) : (
                    filteredTasks.map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => {
                          onProjectChange(selectedProjectId, task.id)
                          setTaskListExpanded(false)
                          setTaskSearch('')
                        }}
                        className={[
                          'w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors text-left',
                          selectedTaskId === task.id ? rowSelected : rowBase,
                        ].join(' ')}
                      >
                        <span className="h-2.5 w-2.5 rounded-full bg-[#6b7280]/50 shrink-0" />
                        <span className="flex-1 truncate">{task.name}</span>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center min-h-[120px] animate-fade-in">
            <div className={`h-16 w-16 rounded-2xl flex items-center justify-center mb-4 shrink-0 ${theme === 'dark' ? 'bg-white/[0.04]' : 'bg-slate-100'}`}>
              <Folder className={`h-8 w-8 ${theme === 'dark' ? 'text-white/30' : 'text-slate-400'}`} strokeWidth={1.25} />
            </div>
            <p className={`text-sm font-medium mb-0.5 text-center ${theme === 'dark' ? 'text-white/80' : 'text-slate-700'}`}>Select a project</p>
            <p className={`text-xs text-center ${theme === 'dark' ? 'text-white/40' : 'text-slate-500'}`}>Choose a project to view tasks</p>
          </div>
        )}
      </div>
    )
  }

  // Collapsed layout: dropdown
  return (
    <div className="space-y-2">
      {/* Project selector */}
      <div ref={containerRef} className="relative">
        <button
          type="button"
          disabled={disabled || loadingProjects}
          onClick={() => setIsOpen(!isOpen)}
          className={[
            'w-full flex items-center gap-2 h-9 px-3 rounded-lg text-sm',
            'border transition-all duration-150 text-left',
            'bg-[rgba(255,255,255,0.04)] text-[#f9fafb]',
            disabled
              ? 'border-[rgba(255,255,255,0.04)] opacity-50 cursor-not-allowed'
              : 'border-[rgba(255,255,255,0.08)] hover:border-[rgba(99,102,241,0.4)] cursor-pointer',
          ].join(' ')}
        >
          {loadingProjects ? (
            <InlineLoader size="sm" />
          ) : selectedProject ? (
            <span
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: selectedProject.color }}
            />
          ) : (
            <Folder className="h-3.5 w-3.5 text-[#6b7280] shrink-0" />
          )}
          <span className={selectedProject ? 'text-[#f9fafb]' : 'text-[#6b7280]'}>
            {selectedProject?.name ?? 'No project'}
          </span>
          <span className="flex-1" />
          {selectedProject ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onProjectChange(null, null)
                setIsOpen(false)
              }}
              className="p-0.5 rounded text-[#4b5563] hover:text-[#9ca3af] transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          ) : (
            <ChevronDown className={`h-3.5 w-3.5 text-[#4b5563] transition-transform duration-300 ease-out ${isOpen ? 'rotate-180' : ''}`} />
          )}
        </button>

        {/* Dropdown */}
        {isOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0d1117] shadow-[0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden animate-fade-in">
            {/* Search */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[rgba(255,255,255,0.06)]">
              <Search className="h-3.5 w-3.5 text-[#4b5563] shrink-0" />
              <input
                autoFocus
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search projects..."
                className="flex-1 bg-transparent text-sm text-[#f9fafb] placeholder:text-[#4b5563] outline-none"
              />
            </div>

            {/* No project option */}
            <button
              type="button"
              onClick={() => {
                onProjectChange(null, null)
                setIsOpen(false)
                setSearch('')
              }}
              className={[
                'w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors text-left',
                !selectedProjectId
                  ? 'bg-[rgba(99,102,241,0.15)] text-[#a5b4fc]'
                  : 'text-[#6b7280] hover:bg-[rgba(255,255,255,0.04)]',
              ].join(' ')}
            >
              <div className="h-2 w-2 rounded-full border border-[rgba(255,255,255,0.2)] shrink-0" />
              No project
            </button>

            {/* Project list */}
            <div className="max-h-80 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="text-xs text-[#4b5563] text-center py-4">
                  {projects.length === 0 ? 'No projects yet' : 'No results'}
                </p>
              ) : (
                filtered.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => {
                      onProjectChange(project.id, null)
                      setIsOpen(false)
                      setSearch('')
                    }}
                    className={[
                      'w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors text-left',
                      selectedProjectId === project.id
                        ? 'bg-[rgba(99,102,241,0.15)] text-[#a5b4fc]'
                        : 'text-[#d1d5db] hover:bg-[rgba(255,255,255,0.04)]',
                    ].join(' ')}
                  >
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: project.color }}
                    />
                    <span className="flex-1">{project.name}</span>
                    <IntegrationIcon id={project.external_id} />
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Task selector — shown only when a project is selected */}
      {selectedProjectId && (
        <div ref={taskContainerRef} className="relative space-y-2">
          {/* Task filter toggle (collapsed) */}
          <div
            className={[
              'flex rounded-lg p-0.5',
              'bg-[rgba(255,255,255,0.04)]',
            ].join(' ')}
          >
            <button
              type="button"
              onClick={() => handleTaskFilterChange('me')}
              className={[
                'flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-medium',
                taskFilter === 'me'
                  ? 'bg-[rgba(99,102,241,0.2)] text-[#a5b4fc]'
                  : 'text-[#9ca3af] hover:text-[#d1d5db]',
              ].join(' ')}
            >
              <User className="h-3 w-3" />
              Assigned to me
            </button>
            <button
              type="button"
              onClick={() => handleTaskFilterChange('all')}
              className={[
                'flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-medium',
                taskFilter === 'all'
                  ? 'bg-[rgba(99,102,241,0.2)] text-[#a5b4fc]'
                  : 'text-[#9ca3af] hover:text-[#d1d5db]',
              ].join(' ')}
            >
              <LayoutGrid className="h-3 w-3" />
              All tasks
            </button>
          </div>
          <button
            type="button"
            disabled={disabled || loadingTasks}
            onClick={() => setIsTaskOpen(!isTaskOpen)}
            className={[
              'w-full flex items-center gap-2 h-9 px-3 rounded-lg text-sm',
              'border transition-all duration-150 text-left',
              'bg-[rgba(255,255,255,0.04)]',
              disabled
                ? 'border-[rgba(255,255,255,0.04)] opacity-50 cursor-not-allowed'
                : 'border-[rgba(255,255,255,0.08)] hover:border-[rgba(99,102,241,0.4)] cursor-pointer',
            ].join(' ')}
          >
            {loadingTasks ? (
              <InlineLoader size="sm" />
            ) : (
              <span className="h-2 w-2 rounded-full bg-[#6b7280] shrink-0" />
            )}
            <span className={selectedTask ? 'text-[#f9fafb]' : 'text-[#6b7280]'}>
              {selectedTask?.name ?? 'Select a task'}
            </span>
            <span className="flex-1" />
            <ChevronDown className={`h-3.5 w-3.5 text-[#4b5563] transition-transform duration-300 ease-out ${isTaskOpen ? 'rotate-180' : ''}`} />
          </button>
          {isTaskOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 z-[100] rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0d1117] shadow-[0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden animate-fade-in">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-[rgba(255,255,255,0.06)]">
                <Search className="h-3.5 w-3.5 text-[#6b7280] shrink-0" />
                <input
                  type="text"
                  value={taskSearch}
                  onChange={(e) => setTaskSearch(e.target.value)}
                  placeholder="Search tasks..."
                  className="flex-1 bg-transparent text-sm text-[#f9fafb] placeholder:text-[#6b7280] outline-none"
                />
              </div>
              <div className="max-h-72 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => {
                    onProjectChange(selectedProjectId, null)
                    setIsTaskOpen(false)
                    setTaskSearch('')
                  }}
                  className={[
                    'w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors text-left',
                    !selectedTaskId ? 'bg-[rgba(99,102,241,0.15)] text-[#a5b4fc]' : 'text-[#6b7280] hover:bg-[rgba(255,255,255,0.04)]',
                  ].join(' ')}
                >
                  <div className="h-2 w-2 rounded-full border border-[rgba(255,255,255,0.2)] shrink-0" />
                  No task
                </button>
                {filteredTasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => {
                      onProjectChange(selectedProjectId, task.id)
                      setIsTaskOpen(false)
                      setTaskSearch('')
                    }}
                    className={[
                      'w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors text-left',
                      selectedTaskId === task.id ? 'bg-[rgba(99,102,241,0.15)] text-[#a5b4fc]' : 'text-[#d1d5db] hover:bg-[rgba(255,255,255,0.04)]',
                    ].join(' ')}
                  >
                    <span className="h-2 w-2 rounded-full bg-[#6b7280]/50 shrink-0" />
                    <span className="flex-1 truncate">{task.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
