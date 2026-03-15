import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  type ReactNode,
} from 'react'
import {
  DEFAULT_CONFIG,
  type DocumentConfig,
  type DeepPartial,
  type SavedConfig,
  type ConfigStorage,
} from '../types/documentConfig'
import {
  DEFAULT_AI_PROOFREAD_CONFIG,
  type AIProofreadConfig,
} from '../types/aiProofread'

const STORAGE_KEY = 'docx-document-config-v2'

// ---- 深合并工具 ----

/** 将 patch 深合并到 target，返回新对象 */
function deepMerge<T extends object>(target: T, patch: DeepPartial<T>): T {
  const result = { ...target }
  for (const key of Object.keys(patch) as (keyof T)[]) {
    const patchVal = patch[key]
    const targetVal = target[key]
    if (
      patchVal !== null &&
      patchVal !== undefined &&
      typeof patchVal === 'object' &&
      !Array.isArray(patchVal) &&
      typeof targetVal === 'object' &&
      targetVal !== null &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        patchVal as DeepPartial<Record<string, unknown>>,
      ) as T[keyof T]
    } else if (patchVal !== undefined) {
      result[key] = patchVal as T[keyof T]
    }
  }
  return result
}

/** 深拷贝对象 */
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

// ---- State ----

interface ConfigState {
  /** 当前激活的配置ID，null 表示使用默认配置 */
  activeConfigId: string | null
  /** 当前编辑中的配置（可能是默认配置的副本或某个自定义配置） */
  currentConfig: DocumentConfig
  /** 所有保存的自定义配置 */
  savedConfigs: SavedConfig[]
  /** AI 校对配置 */
  aiProofreadConfig: AIProofreadConfig
}

// ---- Action ----

type Action =
  | { type: 'update'; patch: DeepPartial<DocumentConfig> }
  | { type: 'switch'; id: string | null }
  | { type: 'saveAs'; config: SavedConfig }
  | { type: 'save'; id: string; config: DocumentConfig }
  | { type: 'delete'; id: string }
  | { type: 'updateAIProofread'; config: AIProofreadConfig }
  | { type: 'resetAIProofread' }

/** 根据 ID 获取配置 */
function getConfigById(state: ConfigState, id: string | null): DocumentConfig {
  if (id === null) {
    return DEFAULT_CONFIG
  }
  const found = state.savedConfigs.find(function (c) {
    return c.id === id
  })
  return found ? found.config : DEFAULT_CONFIG
}

function configReducer(state: ConfigState, action: Action): ConfigState {
  switch (action.type) {
    case 'update':
      return {
        ...state,
        currentConfig: deepMerge(state.currentConfig, action.patch),
      }
    case 'switch':
      return {
        ...state,
        activeConfigId: action.id,
        currentConfig: deepClone(getConfigById(state, action.id)),
      }
    case 'saveAs':
      return {
        ...state,
        savedConfigs: state.savedConfigs.concat([action.config]),
        activeConfigId: action.config.id,
        currentConfig: deepClone(action.config.config),
      }
    case 'save': {
      const newSavedConfigs = state.savedConfigs.map(function (c) {
        if (c.id === action.id) {
          return {
            ...c,
            config: deepClone(action.config),
          }
        }
        return c
      })
      return {
        ...state,
        savedConfigs: newSavedConfigs,
      }
    }
    case 'delete': {
      const newSavedConfigs = state.savedConfigs.filter(function (c) {
        return c.id !== action.id
      })
      // 如果删除的是当前激活的配置，切换回默认配置
      if (state.activeConfigId === action.id) {
        return {
          savedConfigs: newSavedConfigs,
          activeConfigId: null,
          currentConfig: deepClone(DEFAULT_CONFIG),
          aiProofreadConfig: state.aiProofreadConfig,
        }
      }
      return {
        ...state,
        savedConfigs: newSavedConfigs,
      }
    }
    case 'updateAIProofread':
      return {
        ...state,
        aiProofreadConfig: deepClone(action.config),
      }
    case 'resetAIProofread':
      return {
        ...state,
        aiProofreadConfig: deepClone(DEFAULT_AI_PROOFREAD_CONFIG),
      }
    default:
      return state
  }
}

/** 从 localStorage 读取存储结构 */
function loadStorage(): ConfigStorage {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as ConfigStorage
      return {
        activeConfigId: parsed.activeConfigId || null,
        savedConfigs: parsed.savedConfigs || [],
        aiProofreadConfig: parsed.aiProofreadConfig,
      }
    }
  } catch {
    // 解析失败则使用默认值
  }
  return {
    activeConfigId: null,
    savedConfigs: [],
  }
}

/** 从存储结构初始化状态 */
function initState(): ConfigState {
  const storage = loadStorage()
  // 初始化 AI 校对配置，如果存储中没有则使用默认值
  const aiProofreadConfig = storage.aiProofreadConfig
    ? deepClone(storage.aiProofreadConfig)
    : deepClone(DEFAULT_AI_PROOFREAD_CONFIG)
  const currentConfig = deepClone(getConfigById(
    { savedConfigs: storage.savedConfigs, activeConfigId: storage.activeConfigId, currentConfig: DEFAULT_CONFIG, aiProofreadConfig: aiProofreadConfig },
    storage.activeConfigId
  ))
  return {
    activeConfigId: storage.activeConfigId,
    currentConfig: currentConfig,
    savedConfigs: storage.savedConfigs,
    aiProofreadConfig: aiProofreadConfig,
  }
}

// ---- Context ----

interface DocumentConfigContextValue {
  config: DocumentConfig
  savedConfigs: SavedConfig[]
  activeConfigId: string | null
  aiProofreadConfig: AIProofreadConfig
  updateConfig: (patch: DeepPartial<DocumentConfig>) => void
  switchConfig: (id: string | null) => void
  saveAsCustomConfig: (name: string) => void
  saveCurrentConfig: () => void
  deleteCustomConfig: (id: string) => void
  updateAIProofreadConfig: (config: AIProofreadConfig) => void
  resetAIProofreadConfig: () => void
}

const DocumentConfigContext = createContext<DocumentConfigContextValue | null>(null)

// ---- Provider ----

export function DocumentConfigProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(configReducer, null, initState)

  const updateConfig = (patch: DeepPartial<DocumentConfig>) => {
    dispatch({ type: 'update', patch })
  }

  const switchConfig = (id: string | null) => {
    dispatch({ type: 'switch', id })
  }

  const saveAsCustomConfig = (name: string) => {
    const newConfig: SavedConfig = {
      id: Date.now().toString(),
      name: name,
      config: deepClone(state.currentConfig),
      createdAt: Date.now(),
    }
    dispatch({ type: 'saveAs', config: newConfig })
  }

  const saveCurrentConfig = () => {
    if (state.activeConfigId !== null) {
      dispatch({ type: 'save', id: state.activeConfigId, config: state.currentConfig })
    }
  }

  const deleteCustomConfig = (id: string) => {
    dispatch({ type: 'delete', id })
  }

  const updateAIProofreadConfig = (config: AIProofreadConfig) => {
    dispatch({ type: 'updateAIProofread', config })
  }

  const resetAIProofreadConfig = () => {
    dispatch({ type: 'resetAIProofread' })
  }

  // 持久化到 localStorage
  useEffect(function () {
    const storage: ConfigStorage = {
      activeConfigId: state.activeConfigId,
      savedConfigs: state.savedConfigs,
      aiProofreadConfig: state.aiProofreadConfig,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storage))
  }, [state.activeConfigId, state.savedConfigs, state.aiProofreadConfig])

  return (
    <DocumentConfigContext.Provider
      value={{
        config: state.currentConfig,
        savedConfigs: state.savedConfigs,
        activeConfigId: state.activeConfigId,
        aiProofreadConfig: state.aiProofreadConfig,
        updateConfig: updateConfig,
        switchConfig: switchConfig,
        saveAsCustomConfig: saveAsCustomConfig,
        saveCurrentConfig: saveCurrentConfig,
        deleteCustomConfig: deleteCustomConfig,
        updateAIProofreadConfig: updateAIProofreadConfig,
        resetAIProofreadConfig: resetAIProofreadConfig,
      }}
    >
      {children}
    </DocumentConfigContext.Provider>
  )
}

// ---- Hook ----

export function useDocumentConfig(): DocumentConfigContextValue {
  const ctx = useContext(DocumentConfigContext)
  if (!ctx) {
    throw new Error('useDocumentConfig must be used within DocumentConfigProvider')
  }
  return ctx
}
