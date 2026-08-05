//! Minimal ACP JSON-RPC helpers (newline-delimited JSON-RPC 2.0).

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub id: u64,
    pub method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcNotification {
    pub jsonrpc: String,
    pub method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    pub id: Option<Value>,
    #[serde(default)]
    pub result: Option<Value>,
    #[serde(default)]
    pub error: Option<JsonRpcError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcError {
    pub code: i64,
    pub message: String,
    #[serde(default)]
    pub data: Option<Value>,
}

/// Incoming wire message (request, response, or notification).
///
/// Parsed manually so notifications (method, no id) are not mistaken for
/// responses (id, no method).
#[derive(Debug, Clone)]
pub enum Incoming {
    Response(JsonRpcResponse),
    /// Agent-originated request (e.g. session/request_permission).
    Request {
        id: Value,
        method: String,
        params: Option<Value>,
    },
    Notification(JsonRpcNotification),
}

impl Incoming {
    pub fn parse(line: &str) -> Result<Self, serde_json::Error> {
        let value: Value = serde_json::from_str(line)?;
        let obj = value.as_object();
        let has_method = obj.map(|o| o.contains_key("method")).unwrap_or(false);
        let has_id = obj.map(|o| o.contains_key("id")).unwrap_or(false);

        if has_method && has_id {
            let id = value.get("id").cloned().unwrap_or(Value::Null);
            let method = value
                .get("method")
                .and_then(|m| m.as_str())
                .unwrap_or("")
                .to_string();
            let params = value.get("params").cloned();
            return Ok(Incoming::Request { id, method, params });
        }
        if has_method {
            return Ok(Incoming::Notification(serde_json::from_value(value)?));
        }
        Ok(Incoming::Response(serde_json::from_value(value)?))
    }
}

pub fn request(id: u64, method: &str, params: Value) -> String {
    let msg = JsonRpcRequest {
        jsonrpc: "2.0".into(),
        id,
        method: method.into(),
        params: Some(params),
    };
    serde_json::to_string(&msg).expect("jsonrpc request serializes") + "\n"
}

pub fn response(id: Value, result: Value) -> String {
    let msg = json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": result,
    });
    msg.to_string() + "\n"
}

pub fn notification(method: &str, params: Value) -> String {
    let msg = JsonRpcNotification {
        jsonrpc: "2.0".into(),
        method: method.into(),
        params: Some(params),
    };
    serde_json::to_string(&msg).expect("jsonrpc notification serializes") + "\n"
}

pub fn initialize_params() -> Value {
    json!({
        "protocolVersion": 1,
        "clientCapabilities": {
            "fs": {
                "readTextFile": true,
                "writeTextFile": true
            },
            "terminal": true,
            // ACP elicitation (form + URL modes). Explicit objects required per ACP v2.
            "elicitation": {
                "form": {},
                "url": {}
            }
        },
        "clientInfo": {
            "name": "grok-build-gui",
            "version": env!("CARGO_PKG_VERSION")
        }
    })
}

pub fn session_new_params(cwd: &str, yolo: bool) -> Value {
    let mut params = json!({
        "cwd": cwd,
        "mcpServers": []
    });
    if yolo {
        params["_meta"] = json!({ "yoloMode": true });
    }
    params
}

pub fn session_load_params(session_id: &str, cwd: &str, yolo: bool) -> Value {
    let mut params = json!({
        "sessionId": session_id,
        "cwd": cwd,
        "mcpServers": []
    });
    if yolo {
        params["_meta"] = json!({ "yoloMode": true });
    }
    params
}

pub fn session_prompt_params(session_id: &str, text: &str) -> Value {
    session_prompt_blocks(session_id, vec![json!({ "type": "text", "text": text })])
}

pub fn session_prompt_blocks(session_id: &str, blocks: Vec<Value>) -> Value {
    json!({
        "sessionId": session_id,
        "prompt": blocks
    })
}

pub fn session_cancel_params(session_id: &str) -> Value {
    json!({ "sessionId": session_id })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn initialize_advertises_fs_and_terminal() {
        let p = initialize_params();
        assert_eq!(p["protocolVersion"], 1);
        assert_eq!(p["clientCapabilities"]["terminal"], true);
        assert_eq!(p["clientCapabilities"]["fs"]["readTextFile"], true);
        assert_eq!(p["clientCapabilities"]["fs"]["writeTextFile"], true);
        assert!(p["clientCapabilities"]["elicitation"]["form"].is_object());
        assert!(p["clientCapabilities"]["elicitation"]["url"].is_object());
    }

    #[test]
    fn request_is_newline_framed() {
        let line = request(1, "session/new", json!({ "cwd": "/tmp" }));
        assert!(line.ends_with('\n'));
        let v: Value = serde_json::from_str(line.trim()).unwrap();
        assert_eq!(v["method"], "session/new");
        assert_eq!(v["id"], 1);
    }

    #[test]
    fn parse_notification_without_id() {
        let line = r#"{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"x","update":{"sessionUpdate":"agent_message_chunk"}}}"#;
        match Incoming::parse(line).unwrap() {
            Incoming::Notification(n) => assert_eq!(n.method, "session/update"),
            other => panic!("expected notification, got {other:?}"),
        }
    }

    #[test]
    fn parse_response_with_id() {
        let line = r#"{"jsonrpc":"2.0","id":1,"result":{"sessionId":"abc"}}"#;
        match Incoming::parse(line).unwrap() {
            Incoming::Response(r) => {
                assert!(r.result.is_some());
            }
            other => panic!("expected response, got {other:?}"),
        }
    }

    #[test]
    fn parse_request_with_method_and_id() {
        let line = r#"{"jsonrpc":"2.0","id":3,"method":"session/request_permission","params":{}}"#;
        match Incoming::parse(line).unwrap() {
            Incoming::Request { method, .. } => {
                assert_eq!(method, "session/request_permission");
            }
            other => panic!("expected request, got {other:?}"),
        }
    }
}
