import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMavenPom } from "../src/checkers/dependency-maven.ts";
const entry = (name: string, version: string, extra = "") => `<groupId>org.example</groupId><artifactId>${name}</artifactId><version>${version}</version>${extra}`;

test("Maven extraction resolves properties and classifies parents, managed dependencies and plugins", () => {
  const source = `<project xmlns="http://maven.apache.org/POM/4.0.0"><parent>${entry("parent", "1.0.0")}</parent><properties><lib.version>2.0.0</lib.version></properties><dependencyManagement><dependencies><dependency>${entry("lib", "${lib.version}")}</dependency></dependencies></dependencyManagement><dependencies><dependency>${entry("tests", "3.0.0", "<scope>test</scope>")}</dependency></dependencies><build><plugins><plugin><artifactId>maven-compiler-plugin</artifactId><version>3.14.0</version><dependencies><dependency>${entry("helper", "4.0.0")}</dependency></dependencies></plugin></plugins><extensions><extension>${entry("extension", "5.0.0")}</extension></extensions></build></project>`;
  const values = parseMavenPom("pom.xml", source);
  assert.deepEqual(values.map(value => [value.name, value.version, value.artifact_type]), [["org.example:parent", "1.0.0", "parent"], ["org.example:lib", "2.0.0", "managed"], ["org.example:tests", "3.0.0", "development"], ["org.example:helper", "4.0.0", "plugin-dependency"], ["org.apache.maven.plugins:maven-compiler-plugin", "3.14.0", "plugin"], ["org.example:extension", "5.0.0", "build-extension"]]);
});

test("Maven rejects unsafe XML, mutable versions and alternate plugin repositories", () => {
  for (const version of ["LATEST", "1.0-SNAPSHOT", "[1,2)", "${missing}"]) assert.throws(() => parseMavenPom("pom.xml", `<project><dependencies><dependency>${entry("lib", version)}</dependency></dependencies></project>`));
  for (const source of ['<!DOCTYPE project [<!ENTITY secret SYSTEM "file:///private">]><project/>', "<project><broken></project>", "<other/>", "<project><pluginRepositories><pluginRepository><url>https://example.invalid/maven</url></pluginRepository></pluginRepositories></project>"])
    assert.throws(() => parseMavenPom("pom.xml", source));
});
