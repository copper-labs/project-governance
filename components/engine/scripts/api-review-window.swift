// Native buttons own the decision; the review has no script, network or approval endpoint.
import AppKit
import WebKit

final class ReviewWindow: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate {
    var window: NSWindow!
    var approve: NSButton!
    var decided = false
    func applicationDidFinishLaunching(_ notification: Notification) {
        guard CommandLine.arguments.count == 2,
              let html = try? String(contentsOfFile: CommandLine.arguments[1], encoding: .utf8) else { exit(2) }
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = false
        let web = WKWebView(frame: .zero, configuration: configuration)
        web.navigationDelegate = self
        window = NSWindow(contentRect: NSRect(x:0,y:0,width:1100,height:800), styleMask:[.titled,.closable,.resizable,.miniaturizable], backing:.buffered, defer:false)
        window.title = "API review — no decision recorded"
        window.delegate = self
        let container = window.contentView!
        let label = NSTextField(labelWithString:"Review the complete changes. Approval covers this API review only, not builds or publication.")
        approve = NSButton(title:"Approve this review", target:self, action:#selector(accept))
        approve.isEnabled = false
        window.initialFirstResponder = web
        let cancel = NSButton(title:"Cancel", target:self, action:#selector(reject))
        cancel.keyEquivalent = "\u{1b}"
        for view in [web, label, approve!, cancel] { view.translatesAutoresizingMaskIntoConstraints=false; container.addSubview(view) }
        NSLayoutConstraint.activate([
            web.topAnchor.constraint(equalTo:container.topAnchor), web.leadingAnchor.constraint(equalTo:container.leadingAnchor), web.trailingAnchor.constraint(equalTo:container.trailingAnchor), web.bottomAnchor.constraint(equalTo:label.topAnchor,constant:-12),
            label.leadingAnchor.constraint(equalTo:container.leadingAnchor,constant:20),label.bottomAnchor.constraint(equalTo:approve.topAnchor,constant:-12),
            approve.trailingAnchor.constraint(equalTo:container.trailingAnchor,constant:-20),approve.bottomAnchor.constraint(equalTo:container.bottomAnchor,constant:-16),
            cancel.trailingAnchor.constraint(equalTo:approve.leadingAnchor,constant:-12),cancel.centerYAnchor.constraint(equalTo:approve.centerYAnchor)
        ])
        web.loadHTMLString(html, baseURL:nil)
        window.center(); window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps:true)
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { approve.isEnabled=true }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy)->Void) {
        decisionHandler(navigationAction.navigationType == .other && navigationAction.request.url?.absoluteString == "about:blank" ? .allow : .cancel)
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { finish("Load failed") }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { finish("Load failed") }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { finish("Load failed") }
    @objc func accept() { finish("Confirm API decision") }
    @objc func reject() { finish("Cancel") }
    func windowWillClose(_ notification: Notification) { finish("Cancel") }
    func finish(_ answer:String) { if decided { return }; decided=true; print(answer); fflush(stdout); NSApp.terminate(nil) }
}
let app=NSApplication.shared
app.setActivationPolicy(.regular)
let delegate=ReviewWindow()
app.delegate=delegate
app.run()
