"""Prove scoped registry trust leaves public packages and exact release identity intact."""

from __future__ import annotations

import json
import unittest

from tests import test_runtime_dependency_checker as dependency_tests


class PrivateRegistryBoundaryTests(unittest.TestCase):
    """Exercise mixed registries and encoded scoped names through the public checker."""

    def test_mixed_public_and_encoded_private_packages(self):
        """A private scope never moves unscoped or differently scoped dependencies off public npm."""
        fixture = dependency_tests.RuntimeDependencyCheckerTests()
        base = "https://packages.example.test/registry/npm"
        names = ["@example/widget", "@other/widget", "widget"]
        packages, evidence = {}, []
        for name in names:
            registry = base if name.startswith("@example/") else "https://registry.npmjs.org"
            encoded = name.replace("/", "%2f")
            packages[f"node_modules/{name}"] = fixture._lock_entry(
                "widget", "1.2.3", resolved=f"{registry}/{encoded}/-/widget-1.2.3.tgz"
            )
            record = fixture._npm_evidence(name, "1.2.3")
            record.update(artifact_type="transitive", source_url=f"{registry}/{encoded}/1.2.3")
            evidence.append(record)
        lock = json.dumps({"lockfileVersion": 3, "packages": packages})
        with fixture._fixture({"package-lock.json": (None, lock)}) as root:
            fixture._write_registry_policy(root, {"@example": base})
            fixture._write_evidence(root, evidence)
            code, report = fixture._run_checker(root)
        self.assertEqual(code, 0, report)
        self.assertEqual(report["checked"][0]["changed_dependency_count"], 3)

    def test_private_origin_cannot_serve_unconfigured_scope(self):
        """Trust in an origin remains confined to the declared package scope."""
        fixture = dependency_tests.RuntimeDependencyCheckerTests()
        base = "https://packages.example.test/registry/npm"
        for name in ["widget", "@other/widget", "@example-extra/widget"]:
            row = fixture._lock_entry("widget", "1.2.3", resolved=f"{base}/{name}/-/widget-1.2.3.tgz")
            lock = json.dumps({"lockfileVersion": 3, "packages": {f"node_modules/{name}": row}})
            with self.subTest(name=name), fixture._fixture({"package-lock.json": (None, lock)}) as root:
                fixture._write_registry_policy(root, {"@example": base})
                code, report = fixture._run_checker(root)
            self.assertEqual(code, 1, report)
            self.assertIn("dependency.unsupported-format", [item["rule_id"] for item in report["findings"]])


if __name__ == "__main__":
    unittest.main()
