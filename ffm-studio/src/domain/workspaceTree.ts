import type {
  Workspace,
  WorkspaceDirectoryNode,
  WorkspaceFileNode
} from "../types";

export function basename(filePath: string) {
  return filePath.replace(/\\/g, "/").split("/").pop() ?? filePath;
}

export function firstFile(node: Workspace["tree"]): string | null {
  for (const child of node.children) {
    if (child.type === "file") {
      return child.path;
    }
    const nested = firstFile(child);
    if (nested) {
      return nested;
    }
  }
  return null;
}

export function hasDirtyFiles(node: Workspace["tree"], skipPath?: string | null): boolean {
  for (const child of node.children) {
    if (child.type === "file" && child.path !== skipPath && child.dirty) {
      return true;
    }
    if (child.type === "directory" && hasDirtyFiles(child, skipPath)) {
      return true;
    }
  }
  return false;
}

export function collectDirectoryPaths(
  node: WorkspaceDirectoryNode,
  output = new Set<string>()
) {
  output.add(node.path);
  for (const child of node.children) {
    if (child.type === "directory") {
      collectDirectoryPaths(child, output);
    }
  }
  return output;
}

export function findFileNode(
  node: WorkspaceDirectoryNode,
  targetPath: string
): WorkspaceFileNode | null {
  for (const child of node.children) {
    if (child.type === "file" && child.path === targetPath) {
      return child;
    }
    if (child.type === "directory") {
      const nested = findFileNode(child, targetPath);
      if (nested) {
        return nested;
      }
    }
  }
  return null;
}

export function listDirectories(
  node: WorkspaceDirectoryNode,
  output: WorkspaceDirectoryNode[] = []
) {
  output.push(node);
  for (const child of node.children) {
    if (child.type === "directory") {
      listDirectories(child, output);
    }
  }
  return output;
}
