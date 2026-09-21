# Compiled startup runtime updates

Run the absolute repository-local `.governance/runtime/bin/project-governance startup-help` command.
It reads the startup contract shipped with the selected runtime, including work assessment,
application, cancellation, restoration and lost-owner recovery.

Only the native top-level parent may assess and apply an eligible candidate. Children inherit the
parent's runtime. Resume, fork, clear and compaction do not create a fresh update opportunity.
Discovery does not authorize activation. Preserve recorded operations and unresolved cleanup;
never infer success from a timeout or replace an uncertain attempt with another submission.

Project hook installation does not grant native trust or enable compatible updates. Read the
selected startup guide before changing configuration or interpreting an event receipt.
