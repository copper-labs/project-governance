// Responsibility: Prove nested declarations inherit a non-public Kotlin container's visibility.
// Context: The fixture prevents internal implementation members from being classified as public API.
package fixtures

internal class InternalStore {
    fun save() = Unit

    public fun replace() = Unit

    internal object Cache {
        fun clear() = Unit
    }
}

private object PrivateRegistry {
    fun register() = Unit
}
