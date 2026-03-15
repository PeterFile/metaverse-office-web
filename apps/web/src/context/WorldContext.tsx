import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

import type { WorldState } from '../world/types';

// ── Minimal context: world snapshot + selection state ──
// App.tsx manages the polling. OfficeCanvasRenderer subscribes here for
// the projected world state and for the selected agent ID.
interface WorldContextValue {
  world: WorldState | null;
  setWorld: (w: WorldState | null) => void;
  selectedAgentId: string | null;
  setSelectedAgentId: (id: string | null) => void;
}

const WorldContext = createContext<WorldContextValue | null>(null);

export function WorldProvider({ children }: { children: ReactNode }) {
  const [world, setWorld] = useState<WorldState | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  return (
    <WorldContext.Provider value={{ world, setWorld, selectedAgentId, setSelectedAgentId }}>
      {children}
    </WorldContext.Provider>
  );
}

export function useWorld(): WorldContextValue {
  const ctx = useContext(WorldContext);
  if (!ctx) throw new Error('useWorld must be inside WorldProvider');
  return ctx;
}
