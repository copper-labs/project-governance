export const fixtures = [
  {language:'rust',path:'src/session.rs',expected:['Session','SessionStore','load','refresh','identity','rejects_empty'],source:`use crate::store::Store;
/// A session belongs to one actor.
pub struct Session { pub id: String }
pub trait SessionStore {
    fn load(&self, id: &str) -> Option<Session>;
}
impl Session {
    pub async fn refresh<T: SessionStore>(&mut self, store: &T) -> bool {
        store.load(&self.id).is_some()
    }
}
pub fn identity<T>(value: T) -> T where T: Clone {
    value
}
#[cfg(test)]
mod tests {
    #[test]
    fn rejects_empty() { assert!(true); }
}
/* pub fn fake_from_comment() {} */
`},
  {language:'kotlin',path:'src/Session.kt',expected:['Session','SessionStore','load','SessionClient','refresh','decode','defaultSession'],source:`package example.session
import example.store.Store as LocalStore

data class Session(val id: String)
interface SessionStore {
    suspend fun load(id: String): Session?
}
class SessionClient(private val store: SessionStore) {
    suspend fun refresh(id: String): Session? = store.load(id)
}
inline fun <reified T> String.decode(): T? {
    return null
}
fun defaultSession(): Session = Session("test")
// fun fakeFromComment() {}
`},
  {language:'swift',path:'Sources/Session.swift',expected:['SessionStore','load','SessionManager','refresh','isReady','Wrapped'],source:`import Foundation

public protocol SessionStore {
    func load(id: String) async throws -> String
}
@available(macOS 12.0, *)
public actor SessionManager {
    public func refresh<T: SessionStore>(store: T) async throws -> String {
        return try await store.load(id: "session")
    }
}
extension SessionManager {
    func isReady() -> Bool { true }
}
public struct Wrapped<T> { public let value: T }
// func fakeFromComment() {}
`},
  {language:'dart',path:'lib/session.dart',expected:['identity','Session','Session.named','refresh','SessionView','label','SessionId','Pair'],source:`import 'store.dart' as storage;

T identity<T>(T value) => value;
class Session {
  final String id;
  Session.named(this.id);
  Future<String> refresh() async {
    return id;
  }
}
extension SessionView on Session {
  String get label => id;
}
extension type SessionId(String value) {}
typedef Pair = (String, int);
// class FakeFromComment {}
`},
  {language:'objc',path:'Sources/Session.h',expected:['SessionStore','loadWithID:completion:','Session','refreshWithStore:'],source:`#import <Foundation/Foundation.h>

@protocol SessionStore <NSObject>
- (void)loadWithID:(NSString *)identifier completion:(void (^)(NSString *))completion;
@end

@interface Session : NSObject
@property(nonatomic, copy) NSString *identifier;
- (void)refreshWithStore:(id<SessionStore>)store;
@end
`},
  {language:'objc',path:'Sources/Session.m',expected:['Session','refreshWithStore:','Session(Debug)','debugLabel'],source:`#import "Session.h"
@implementation Session
- (void)refreshWithStore:(id<SessionStore>)store {
    [store loadWithID:self.identifier completion:^(NSString *value) { NSLog(@"%@", value); }];
}
@end
@implementation Session (Debug)
- (NSString *)debugLabel { return self.identifier; }
@end
// - (void)fakeFromComment {}
`},
  {language:'objc',path:'Sources/Bridge.mm',expected:['Bridge','read'],mixed:true,source:`#import "Session.h"
#include <vector>
namespace bridge {
std::vector<int> values = {1, 2};
}
@interface Bridge : NSObject
- (int)read;
@end
@implementation Bridge
- (int)read { return static_cast<int>(bridge::values.size()); }
@end
`},
  {language:'java',path:'src/Session.java',expected:['Session','SessionStore','load','LocalStore','LocalStore','refresh'],source:`package example.session;
import java.util.Optional;

public record Session(String id) {}
sealed interface SessionStore permits LocalStore {
    Optional<Session> load(String id);
}
final class LocalStore implements SessionStore {
    LocalStore() {}
    public Optional<Session> load(String id) { return Optional.empty(); }
    public <T extends SessionStore> String refresh(T store) {
        return "café 🦉";
    }
}
// public class FakeFromComment {}
`.replaceAll('\n','\r\n')}
];
