// =============================================
// PREVIEW REDUCER - Undo/Redo State Management
// =============================================

import { useReducer, useCallback } from 'react';
import type { PreviewState, PreviewAction, DocumentData } from '@/types/preview';

// ---------------------------------------------
// Initial State
// ---------------------------------------------

const initialState: PreviewState = {
  activeDocument: null,
  isEditing: false,
  history: [],
  future: [],
  isLoading: false,
  error: null,
};

// ---------------------------------------------
// Helper: Deep clone + set nested value by dot-path
// ---------------------------------------------

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const clone = structuredClone(obj);
  const keys = path.split('.');
  let current: Record<string, unknown> = clone;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    // Handle array indices like "quotation_items.0.sales_unit_price"
    if (/^\d+$/.test(keys[i + 1]) && Array.isArray(current[key])) {
      current = current[key] as unknown as Record<string, unknown>;
      continue;
    }
    if (typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }

  current[keys[keys.length - 1]] = value;
  return clone;
}

// ---------------------------------------------
// Reducer
// ---------------------------------------------

function previewReducer(state: PreviewState, action: PreviewAction): PreviewState {
  switch (action.type) {
    // Load new document from SSE or database
    case 'LOAD_DOCUMENT': {
      return {
        ...state,
        activeDocument: action.payload,
        isEditing: false,
        history: [],       // Reset history on new document load
        future: [],
        isLoading: false,
        error: null,
      };
    }

    // Update a single field — pushes current state to history for undo
    case 'UPDATE_FIELD': {
      if (!state.activeDocument) return state;

      const updatedData = setNestedValue(
        state.activeDocument.data as unknown as Record<string, unknown>,
        action.path,
        action.value
      );

      const updatedDocument: DocumentData = {
        ...state.activeDocument,
        data: updatedData as unknown as DocumentData['data'],
      } as DocumentData;

      return {
        ...state,
        activeDocument: updatedDocument,
        history: [...state.history, state.activeDocument],  // Save previous for undo
        future: [],                                          // Clear redo stack
      };
    }

    // Toggle edit mode
    case 'TOGGLE_EDIT': {
      return {
        ...state,
        isEditing: !state.isEditing,
      };
    }

    // Undo: restore previous state from history
    case 'UNDO': {
      if (state.history.length === 0) return state;
      const previous = state.history[state.history.length - 1];
      return {
        ...state,
        activeDocument: previous,
        history: state.history.slice(0, -1),
        future: state.activeDocument
          ? [state.activeDocument, ...state.future]
          : state.future,
      };
    }

    // Redo: restore next state from future
    case 'REDO': {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return {
        ...state,
        activeDocument: next,
        history: state.activeDocument
          ? [...state.history, state.activeDocument]
          : state.history,
        future: state.future.slice(1),
      };
    }

    case 'SET_LOADING':
      return { ...state, isLoading: action.isLoading };

    case 'SET_ERROR':
      return { ...state, error: action.error, isLoading: false };

    case 'CLEAR':
      return initialState;

    default:
      return state;
  }
}

// ---------------------------------------------
// Hook
// ---------------------------------------------

export function usePreviewReducer() {
  const [state, dispatch] = useReducer(previewReducer, initialState);

  const loadDocument = useCallback((doc: DocumentData) => {
    dispatch({ type: 'LOAD_DOCUMENT', payload: doc });
  }, []);

  const updateField = useCallback((path: string, value: unknown) => {
    dispatch({ type: 'UPDATE_FIELD', path, value });
  }, []);

  const toggleEdit = useCallback(() => {
    dispatch({ type: 'TOGGLE_EDIT' });
  }, []);

  const undo = useCallback(() => {
    dispatch({ type: 'UNDO' });
  }, []);

  const redo = useCallback(() => {
    dispatch({ type: 'REDO' });
  }, []);

  const setLoading = useCallback((isLoading: boolean) => {
    dispatch({ type: 'SET_LOADING', isLoading });
  }, []);

  const setError = useCallback((error: string | null) => {
    dispatch({ type: 'SET_ERROR', error });
  }, []);

  const clear = useCallback(() => {
    dispatch({ type: 'CLEAR' });
  }, []);

  return {
    state,
    actions: {
      loadDocument,
      updateField,
      toggleEdit,
      undo,
      redo,
      setLoading,
      setError,
      clear,
    },
  };
}
