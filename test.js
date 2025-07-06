"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const mysql = __importStar(require("mysql2/promise"));
const path = __importStar(require("path"));
const schemaFromDb = path.join(__dirname, 'schemaFromDb.txt');
// MySQL 연결 설정
const connection = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '1234',
    database: 'localpms',
    port: 33069,
});
// 쿼리 실행 예제
async function main() {
    try {
        const [rows] = await connection.query(`
          SELECT 
          column_name, 
          data_type, 
          is_nullable,
          column_key
          FROM information_schema.columns
          WHERE 
          table_schema = ? AND table_name = ?;
      `, ['localpms', 'pms_button']);
        console.log(typeof rows);
        updateDataTypes(rows);
    }
    catch (err) {
        console.error('Error executing query: ', err.message);
    }
    finally {
        await connection.end();
    }
}
// DB 스키마 정보 타입 문자열 정제
function updateDataTypes(data) {
    return data.map((item) => {
        if (item.data_type === "timestamp without time zone") {
            return { ...item, data_type: "timestamp" };
        }
        else if (item.data_type === "character varying") {
            return { ...item, data_type: "character" };
        }
        return item; // 다른 값은 그대로 유지
    });
}
main();
//# sourceMappingURL=test.js.map