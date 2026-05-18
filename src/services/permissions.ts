import { groupsRepo, membersRepo, type Group } from "../db/repos/groups.js";

export interface ResolvedGroup {
  group: Group;
  isCreator: boolean;
  isMember: boolean;
  canEdit: boolean;
}

export function resolveGroup(guildId: string, groupName: string, userId: string): ResolvedGroup | undefined {
  const group = groupsRepo.byName(guildId, groupName);
  if (!group) return undefined;
  const member = membersRepo.get(group.id, userId);
  return {
    group,
    isCreator: group.creator_id === userId,
    isMember: !!member,
    canEdit: !!member && (group.creator_id === userId || member.can_edit === 1),
  };
}

export type PermLevel = "member" | "editor" | "creator";

export function ensure(r: ResolvedGroup, level: PermLevel): string | null {
  if (!r.isMember) return `You are not a member of **${r.group.name}**.`;
  if (level === "editor" && !r.canEdit) return `You need edit permission in **${r.group.name}**.`;
  if (level === "creator" && !r.isCreator) return `Only the creator of **${r.group.name}** can do that.`;
  return null;
}
