import { create } from "zustand";
import type { TeamMember } from "@/types/user";

interface TeamMembersState {
  teamMembers: TeamMember[];
  setTeamMembers: (members: TeamMember[]) => void;
  addTeamMember: (member: TeamMember) => void;
  removeTeamMember: (memberId: number) => void;
}

export const useTeamMembersStore = create<TeamMembersState>((set) => ({
  teamMembers: [],
  setTeamMembers: (members) => set({ teamMembers: members }),
  addTeamMember: (member) =>
    set((state) => {
      if (state.teamMembers.some((m) => m.id === member.id)) {
        console.warn("Member already exists:", member);
        return state; // No change if member already exists
      }
      return { teamMembers: [...state.teamMembers, member] };
    }),
  removeTeamMember: (memberId) =>
    set((state) => ({
      teamMembers: state.teamMembers.filter((member) => member.id !== memberId),
    })),
}));
