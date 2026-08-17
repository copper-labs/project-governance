// Responsibility: Prove the active Kotlin adapter does not overclaim protected-surface coverage.
// Context: Generated-target proof keeps protected declarations outside blocking scope until that capability is configured and proven.
package fixtures

/**
 * Represent a documented public type with a protected implementation hook.
 *
 * The public type is enforced while its protected hook remains outside the active capability set.
 */
public open class ProtectedSurface {
    protected fun implementationHook() = Unit
}
