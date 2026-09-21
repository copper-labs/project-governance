import { SaxesParser } from "saxes";
import { dependency, type DependencyCoordinate } from "./dependency-manifests.ts";
interface Element { name: string; text: string; children: Element[]; parent: Element | null }
const child = (element: Element | undefined, name: string) => element?.children.find(item => item.name === name);
const text = (element: Element | undefined, name: string) => child(element, name)?.text.trim() ?? "";
/** Parse XML without entity declarations or network resolution, retaining namespace-local Maven names. */
export function parseMavenPom(path: string, source: string): DependencyCoordinate[] {
  if (/<!DOCTYPE|<!ENTITY/iu.test(source)) throw new Error(`${path}: Maven XML declarations with entities are unsupported`);
  const stack: Element[] = [], nodes: Element[] = [];
  const parser = new SaxesParser({ xmlns: true });
  parser.on("error", () => { throw new Error(`${path}: invalid Maven XML`); });
  parser.on("opentag", tag => {
    if (stack.length >= 256 || nodes.length >= 100_000) throw new Error(`${path}: Maven XML exceeds supported structure limits`);
    const parent = stack.at(-1) ?? null, element: Element = { name: tag.local, text: "", children: [], parent };
    parent?.children.push(element); nodes.push(element); stack.push(element);
  });
  parser.on("text", value => { const current = stack.at(-1); if (current && !current.children.length) current.text += value; });
  parser.on("cdata", value => { const current = stack.at(-1); if (current && !current.children.length) current.text += value; });
  parser.on("closetag", () => { stack.pop(); });
  parser.write(source).close();
  const root = nodes[0]; if (!root || root.name !== "project") throw new Error(`${path}: Maven POM root must be project`);
  const parent = child(root, "parent"), projectGroup = text(root, "groupId") || text(parent, "groupId"), projectVersion = text(root, "version") || text(parent, "version");
  const properties = new Map<string, string>([["project.groupId", projectGroup], ["pom.groupId", projectGroup], ["project.version", projectVersion], ["pom.version", projectVersion]]);
  if (parent) { properties.set("project.parent.version", text(parent, "version")); properties.set("parent.version", text(parent, "version")); }
  for (const property of child(root, "properties")?.children ?? []) properties.set(property.name, property.text.trim());
  for (const container of nodes.filter(node => ["repositories", "pluginRepositories"].includes(node.name))) {
    for (const repository of container.children.filter(node => ["repository", "pluginRepository"].includes(node.name)))
      if (!["https://repo1.maven.org/maven2", "https://repo.maven.apache.org/maven2"].includes(text(repository, "url").replace(/\/+$/u, ""))) throw new Error(`${path}: Maven repositories must use canonical Maven Central HTTPS URLs`);
  }
  const coordinate = (element: Element, artifact: string, defaultGroup = "") => {
    const group = text(element, "groupId") || defaultGroup, name = text(element, "artifactId"); let version = text(element, "version");
    if (!/^[0-9A-Za-z][0-9A-Za-z_.-]*$/u.test(group) || !/^[0-9A-Za-z][0-9A-Za-z_.-]*$/u.test(name) || !version) throw new Error(`${path}: Maven coordinates require exact groupId, artifactId and version`);
    const reference = /^\$\{([^}]+)\}$/u.exec(version); if (reference) version = properties.get(reference[1]!) ?? "";
    if (!/^[0-9A-Za-z][0-9A-Za-z._+-]*$/u.test(version) || ["LATEST", "RELEASE"].includes(version.toUpperCase()) || version.toUpperCase().endsWith("-SNAPSHOT")) throw new Error(`${path}: Maven version must resolve to an exact non-SNAPSHOT version`);
    return dependency(`${group}:${name}`, "maven", version, artifact);
  };
  const values: DependencyCoordinate[] = parent ? [coordinate(parent, "parent")] : [];
  for (const container of nodes.filter(node => node.name === "dependencies")) for (const entry of container.children.filter(node => node.name === "dependency")) {
    const scopeTypes: Record<string, string> = { test: "development", provided: "provided", runtime: "runtime", import: "managed" };
    const artifact = container.parent?.name === "dependencyManagement" ? "managed" : container.parent?.name === "plugin" ? "plugin-dependency" : scopeTypes[text(entry, "scope")] ?? "direct";
    values.push(coordinate(entry, artifact));
  }
  for (const plugin of nodes.filter(node => node.name === "plugin")) values.push(coordinate(plugin, "plugin", "org.apache.maven.plugins"));
  for (const extension of child(child(root, "build"), "extensions")?.children ?? []) if (extension.name === "extension") values.push(coordinate(extension, "build-extension"));
  return values;
}
