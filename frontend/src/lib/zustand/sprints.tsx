import { create } from "zustand";
import type { SprintWithStats } from "@/types/sprint";

interface SprintState {
  sprint: SprintWithStats | null;
  setSprint: (sprint: SprintWithStats | null) => void;
  activeSprint: SprintWithStats | null;
  setActiveSprint: (sprint: SprintWithStats | null) => void;
  sprints: SprintWithStats[];
  setSprints: (sprints: SprintWithStats[]) => void;
  addSprint: (sprint: SprintWithStats) => void;
  removeSprint: (id: number) => void;
}

export const useSprintStore = create<SprintState>((set) => ({
  sprint: null,
  setSprint: (sprint) => set({ sprint }),
  activeSprint: null,
  setActiveSprint: (sprint) => set({ activeSprint: sprint }),
  sprints: [],
  setSprints: (sprints) => set({ sprints }),
  addSprint: (sprint) =>
    set((state) => ({ sprints: [...state.sprints, sprint] })),
  removeSprint: (id) =>
    set((state) => ({
      sprints: state.sprints.filter((sprint) => sprint.id !== id),
    })),
}));
