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
exports.activate = activate;
exports.deactivate = deactivate;
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const mysql = __importStar(require("mysql2/promise"));
// 파일 잠금 상태를 추적하는 변수
let isFileWriting = false;
let isMermaidFileWriting = false;
// DB 설정 정보
const dbLocalpmsConfig = {
    user: 'root',
    host: 'localhost',
    database: 'localpms',
    password: '1234',
    port: 33069,
};
// MySQL 연결 설정 함수
function createConnection() {
    return mysql.createPool({
        host: 'localhost',
        user: 'root',
        password: '1234',
        database: 'localpms',
        port: 33069,
    });
}
// 파일 경로 설정
const filePath = path.join(__dirname, 'schemas.txt');
const originFilePath = path.join(__dirname, 'OriginSchemas.txt');
const mermaidFilePath = path.join(__dirname, 'mermaid.txt');
const relationFilePath = path.join(__dirname, 'relations.txt');
const pdffilePath = path.join(__dirname, 'schemas.pdf');
/* DB 스키마 정보 추출 */
// 데이터베이스에서 스키마 정보를 가져오는 함수
// async function fetchSchemas(): Promise<string[]> {
//   const client = new Client(dbLocalpmsConfig);
//   const query = `
//       SELECT 
//       column_name, 
//       data_type, 
//       is_nullable,
//       column_key
//       FROM information_schema.columns
//       WHERE 
//       table_schema = $1 AND table_name = $2;
//   `;
//   try {
//     await client.connect();
//     const result = await client.query(query);
//     console.log(`fetchSchemas: ${result}`)
//     return result.rows.map(row => row.schema_name); // 스키마 이름 배열 반환
//   } catch (error) {
//     console.error('Error fetching schemas:', error);
//     throw error;
//   }
// }
// 특정 스키마의 모든 테이블 이름 가져오기 (연결을 외부에서 받음)
async function getTableNames(connection, schemaName) {
    try {
        const query = `
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = ? AND table_type = 'BASE TABLE';
        `;
        const [result] = await connection.query(query, [schemaName]);
        console.log('Raw table names result:', result);
        console.log('First row structure:', result[0]);
        console.log('Available keys in first row:', Object.keys(result[0] || {}));
        const tableNames = result.map((row) => {
            // 여러 가능한 컬럼명을 시도
            const tableName = row.table_name || row.TABLE_NAME || row.Table_Name;
            console.log('Row:', row, 'Extracted table name:', tableName);
            return tableName;
        });
        console.log('Processed table names:', tableNames);
        return tableNames;
    }
    catch (error) {
        console.error('Error fetching table names:', error);
        throw error;
    }
}
// 특정 테이블의 컬럼 정보 가져오기 (연결을 외부에서 받음)
async function getTableInfoWithConnection(connection, schemaName, tableName) {
    try {
        const query = `
      SELECT
          c.COLUMN_TYPE AS ct,
          c.COLUMN_NAME AS cn,
          CASE 
              WHEN c.COLUMN_KEY = 'PRI' THEN 'PK'
              WHEN kcu.REFERENCED_TABLE_NAME IS NOT NULL THEN 'FK'
              ELSE ''
          END AS kt
      FROM 
          information_schema.COLUMNS c
      LEFT JOIN 
          information_schema.KEY_COLUMN_USAGE kcu
          ON c.TABLE_SCHEMA = kcu.TABLE_SCHEMA
          AND c.TABLE_NAME = kcu.TABLE_NAME
          AND c.COLUMN_NAME = kcu.COLUMN_NAME
      WHERE 
          c.TABLE_SCHEMA = ? 
          AND c.TABLE_NAME = ?  
      ORDER BY 
          c.ORDINAL_POSITION;
    `;
        const [rows] = await connection.query(query, [schemaName, tableName]);
        console.log(`Raw table info for ${tableName}:`, rows);
        return rows; // 컬럼 정보 배열 반환
    }
    catch (error) {
        console.error(`Error fetching info for table ${tableName}:`, error);
        throw error;
    }
}
// 특정 테이블의 컬럼 정보 가져오기 (기존 함수 - 호환성 유지)
async function getTableInfo(schemaName, tableName) {
    const connection = createConnection();
    try {
        const tableInfo = await getTableInfoWithConnection(connection, schemaName, tableName);
        return tableInfo;
    }
    catch (error) {
        console.error(`Error fetching info for table ${tableName}:`, error);
        throw error;
    }
    finally {
        await connection.end();
    }
}
async function getRelationInfoWithConnection(connection, schemaName) {
    try {
        const query = `
      WITH ForeignKeys AS (
          SELECT 
              kcu.TABLE_NAME AS child_table,
              kcu.COLUMN_NAME AS child_column,
              kcu.REFERENCED_TABLE_NAME AS parent_table,
              kcu.REFERENCED_COLUMN_NAME AS parent_column
          FROM 
              information_schema.KEY_COLUMN_USAGE kcu
          WHERE 
              kcu.REFERENCED_TABLE_NAME IS NOT NULL
      ),
      UniqueKeys AS (
          SELECT 
              tc.TABLE_NAME,
              kcu.COLUMN_NAME,
              tc.CONSTRAINT_TYPE
          FROM 
              information_schema.TABLE_CONSTRAINTS tc
          JOIN 
              information_schema.KEY_COLUMN_USAGE kcu
              ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
              AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
          WHERE 
              tc.CONSTRAINT_TYPE IN ('PRIMARY KEY', 'UNIQUE')
      )
      SELECT DISTINCT
          fk.child_table,
          fk.parent_table,
          CASE
              WHEN uq_child.CONSTRAINT_TYPE = 'UNIQUE' AND uq_parent.CONSTRAINT_TYPE = 'UNIQUE' THEN '1:1'
              WHEN uq_parent.CONSTRAINT_TYPE = 'UNIQUE' THEN '1:N'
              ELSE 'N:N'
          END AS relationship_type
      FROM 
          ForeignKeys fk
      LEFT JOIN 
          UniqueKeys uq_child
          ON fk.child_table = uq_child.TABLE_NAME
          AND fk.child_column = uq_child.COLUMN_NAME
      LEFT JOIN 
          UniqueKeys uq_parent
          ON fk.parent_table = uq_parent.TABLE_NAME
          AND fk.parent_column = uq_parent.COLUMN_NAME;

    `;
        const [rows] = await connection.query(query, [schemaName]);
        console.log(`Raw relation info for ${schemaName}:`, rows);
        return rows; // 관계 정보 배열 반환
    }
    catch (error) {
        console.error(`Error fetching info for Info:`, error);
        throw error;
    }
}
async function getRelationInfo(schemaName) {
    const connection = createConnection();
    try {
        const RelationInfo = await getRelationInfoWithConnection(connection, schemaName);
        return RelationInfo;
    }
    catch (error) {
        console.error(`Error fetching info for Info:`, error);
        return []; // 에러 시 빈 배열 반환
    }
    finally {
        await connection.end();
    }
}
// 파일에 스키마 정보를 저장하는 함수 (동기화 처리)
async function saveOriginSchemasToFile(schemas) {
    console.log('saveOriginSchemasToFile called with:', schemas);
    console.log('originFilePath:', originFilePath);
    // 파일 쓰기가 진행 중이면 대기
    while (isFileWriting) {
        console.log('Waiting for file writing to complete...');
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    try {
        isFileWriting = true; // 파일 쓰기 시작
        console.log('File writing started, isFileWriting:', isFileWriting);
        // 파일 쓰기를 동기적으로 처리
        if (fs.existsSync(originFilePath)) {
            // 파일이 이미 존재하면 업데이트
            console.log('File exists. Updating... OriginSchemas');
            fs.appendFileSync(originFilePath, schemas + '\n', 'utf8');
        }
        else {
            // 파일이 없으면 새로 생성
            console.log('File does not exist. Creating new file... OriginSchemas');
            fs.writeFileSync(originFilePath, schemas + '\n', 'utf8');
        }
        console.log('Schemas saved to file OriginSchemas:', originFilePath);
        console.log('File content after save:', fs.readFileSync(originFilePath, 'utf8'));
    }
    catch (error) {
        console.error('Error saving to file:', error);
        // 파일 쓰기 실패 시 재시도 로직을 추가할 수 있음
    }
    finally {
        isFileWriting = false; // 파일 쓰기 완료
        console.log('File writing completed, isFileWriting:', isFileWriting);
    }
}
// OriginSchemas.txt 파일을 초기화하는 함수
function initializeFiles() {
    console.log('initializeOriginSchemasFile called');
    console.log('originFilePath:', originFilePath);
    try {
        if (fs.existsSync(mermaidFilePath)) {
            fs.unlinkSync(mermaidFilePath);
            console.log('Deleted existing mermaid.txt file');
        }
        // 빈 파일 생성
        fs.writeFileSync(mermaidFilePath, '', 'utf8');
        fs.appendFileSync(mermaidFilePath, 'erDiagram\n', 'utf8');
        console.log('Initialized mermaid.txt file');
        console.log('File exists after initialization:', fs.existsSync(mermaidFilePath));
    }
    catch (error) {
        console.error('Error initializing mermaid.txt file:', error);
    }
    try {
        if (fs.existsSync(relationFilePath)) {
            fs.unlinkSync(relationFilePath);
            console.log('Deleted existing relations.txt file');
        }
        // 빈 파일 생성
        fs.writeFileSync(relationFilePath, '', 'utf8');
        console.log('Initialized relations.txt file');
        console.log('File exists after initialization:', fs.existsSync(relationFilePath));
    }
    catch (error) {
        console.error('Error initializing relations.txt file:', error);
    }
}
// originFilePath 파일 삭제 함수
function deleteOriginSchemasFile() {
    try {
        if (fs.existsSync(originFilePath)) {
            fs.unlinkSync(originFilePath);
            console.log('Successfully deleted file:', originFilePath);
            vscode.window.showInformationMessage(`Deleted file: ${originFilePath}`);
        }
        else {
            console.log('File does not exist:', originFilePath);
            vscode.window.showInformationMessage(`File does not exist: ${originFilePath}`);
        }
    }
    catch (error) {
        console.error('Error deleting file:', error);
        vscode.window.showErrorMessage(`Error deleting file: ${error}`);
    }
}
// mermaidFilePath 파일 읽기 함수
function readMermaidFile() {
    try {
        if (fs.existsSync(mermaidFilePath)) {
            const mermaidContent = fs.readFileSync(mermaidFilePath, 'utf8');
            console.log('Successfully read mermaid file:', mermaidFilePath);
            return mermaidContent;
        }
        else {
            console.log('Mermaid file does not exist:', mermaidFilePath);
            return '';
        }
    }
    catch (error) {
        console.error('Error reading mermaid file:', error);
        return '';
    }
}
// relationInfo를 파일에 저장하는 함수
async function saveRelationInfoToFile(relationInfo) {
    try {
        console.log('Saving relation info to file:', relationFilePath);
        // 관계 정보를 읽기 쉬운 형태로 변환
        const relationData = relationInfo.map((relation, index) => {
            return `Relation ${index + 1}:
  Child Table: ${relation.child_table || 'N/A'}
  Parent Table: ${relation.parent_table || 'N/A'}
  Relationship Type: ${relation.relationship_type || 'N/A'}
`;
        }).join('\n');
        // 파일에 저장
        fs.writeFileSync(relationFilePath, relationData, 'utf8');
        console.log('Relation info saved successfully to:', relationFilePath);
        // JSON 형태로도 저장 (추가 파일)
        const jsonFilePath = path.join(__dirname, 'relations.json');
        fs.writeFileSync(jsonFilePath, JSON.stringify(relationInfo, null, 2), 'utf8');
        console.log('Relation info JSON saved to:', jsonFilePath);
    }
    catch (error) {
        console.error('Error saving relation info to file:', error);
        throw error;
    }
}
// AI API 호출 함수
async function callAIRelationApi(relationBatch) {
    try {
        console.log('callAIapi called with batch size:', relationBatch.length);
        const apiUrl = "https://ai-openapi.lotte.net:32001/api/chatgpt";
        const token = "eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJoeXVuamlrLmxlZSIsImlzcyI6ImFpX3BsYXRmb3JtIiwiZ3JvdXAiOiIwMzMxMDAiLCJhdXRob3JpdGllcyI6IlJPTEVfVVNFUl9JRCIsInR5cGUiOiJBQ0NFU1MiLCJleHAiOjM4ODc2MDgwOTZ9.Av3kIIIa2HMlJfx0KUdKwN30xadIfC7AmZXNP2go8PlfqlGA_WpoOGmHqFaYYevr3fYCr17ZP2-Sjk7SDi2gkQ";
        const relationData = relationBatch.map((relation, index) => `${index + 1}. Child Table: ${relation.child_table}, Parent Table: ${relation.parent_table}, Relationship: ${relation.relationship_type}`).join('\n');
        const res = await fetch(apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                query: `아래 데이터베이스 관계 정보를 분석하여 mermaid erdiagram 코드로 변환:\n\n${relationData}`,
                history: ""
            }),
        });
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        const data = await res.json();
        console.log('AI API Response for batch:', data.message);
        return data.message;
    }
    catch (error) {
        console.error('Error calling AI API:', error);
        throw error;
    }
}
// AI 응답을 파일에 저장하는 함수
async function saveAIResponseToFile(batchIndex, aiResponse) {
    try {
        // const aiResponseFilePath = path.join(__dirname, 'ai_relation_analysis.txt');
        const content = `\n${aiResponse}\n`;
        // 파일에 추가 (누적 저장)
        fs.appendFileSync(mermaidFilePath, content, 'utf8');
        console.log('AI response saved to:', mermaidFilePath);
    }
    catch (error) {
        console.error('Error saving AI response to file:', error);
        throw error;
    }
}
// function updateDataTypes(data:any ){
//   return data.map((item) => {
//     if(item.data_type === "timestamp without time zone") {
//       return { ... item, data_type: "timestamp"};
//     }
//     else if(item.data_type === "character varying") {
//       return {...item, data_type: "character"};
//     }
//     return item; // 다른 값은 그대로 유지
//   })
// }
// fetchSchemas 호출 시 바로 호출되는 함수수
// '+' 문자를 제거하는 헬퍼 함수
function removePlusSigns(input) {
    return input.replace(/\+/g, '');
}
async function fetchAllTablesInfo(schemaName) {
    try {
        // 0. 기존 파일 삭제 및 초기화
        initializeFiles();
        // 1. 테이블 이름 가져오기
        const connection = createConnection();
        const tableNames = await getTableNames(connection, schemaName);
        console.log(`Found tables in schema "${schemaName}":`, tableNames);
        // 2. 각 테이블의 정보 가져오기 (배치 병렬 처리)
        const BATCH_SIZE = 50; // 한 번에 처리할 테이블 수
        const allResults = [];
        for (let i = 0; i < tableNames.length; i += BATCH_SIZE) {
            const batch = tableNames.slice(i, i + BATCH_SIZE);
            console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(tableNames.length / BATCH_SIZE)}`);
            const batchPromises = batch.map(async (tableName) => {
                try {
                    console.log(`Fetching info for table: ${tableName}`);
                    const tableInfo = await getTableInfo(schemaName, tableName);
                    console.log(`Info for table "${tableName}":`, tableInfo);
                    vscode.window.showInformationMessage(`Info for table "${tableName}": ${JSON.stringify(tableInfo)}`);
                    // 5.테이블 정보 mermaid 코드 변환
                    const tableInfoString = `${tableName}: ${JSON.stringify(tableInfo)}`;
                    await vscode.commands.executeCommand('visualdbforpms.changeMermaid', tableInfoString);
                    await vscode.commands.executeCommand('visualdbforpms.getRelationInfo');
                    return { tableName, tableInfo };
                }
                catch (error) {
                    console.error(`Error processing table ${tableName}:`, error);
                    return { tableName, error };
                }
            });
            // 배치별로 병렬 처리
            const batchResults = await Promise.all(batchPromises);
            allResults.push(...batchResults);
            // 배치 처리 후 잠시 대기 (데이터베이스 부하 방지)
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        console.log('All tables processed:', allResults.length);
        // 3. 파일 쓰기와 Mermaid 변환을 순차적으로 처리 (충돌 방지)
        console.log('Starting file writing process...');
        console.log('Total results to process:', allResults.length);
        for (const result of allResults) {
            console.log('Processing result:', result);
            if (result.error) {
                console.log('Skipping result with error:', result.error);
                continue; // 에러가 있는 경우 스킵
            }
            console.log('Saving table name to OriginSchemas:', result.tableName);
            // 파일에 테이블 이름 저장
            await saveOriginSchemasToFile(result.tableName);
            console.log('Saving table info to OriginSchemas:', result.tableInfo);
            // 파일에 테이블 정보 저장 (+ 문자 제거)
            const cleanedTableInfo = removePlusSigns(JSON.stringify(result.tableInfo));
            await saveOriginSchemasToFile(cleanedTableInfo);
            fs.appendFileSync(filePath, '\n', 'utf8');
            // 4. mermaid 코드 변환 (순차 처리로 충돌 방지) (+ 문자 제거)
            const tableInfoString = `${result.tableName}: ${cleanedTableInfo}`;
            await vscode.commands.executeCommand('visualdbforpms.changeMermaid', tableInfoString);
        }
        console.log('File writing process completed.');
    }
    catch (error) {
        console.error('Error fetching tables info:', error);
    }
}
/******************************* AImember 통신 *******************************/
const repository = [];
const service = [];
const prompt = [];
const modelCamelSnake = new Map();
const repositoryModelMap = new Map();
const modelServiceMap = new Map();
const modelAIresMap = new Map();
// 모델 서비스 태그 추가 함수
function addModelTag(model, tag) {
    const tags = modelServiceMap.get(model) || [];
    tags.push(tag);
    modelServiceMap.set(model, tags);
}
// 모델에 대한 ai 응답 태그 추가 함수
function addAIresponseTag(model, tag) {
    const tags = modelAIresMap.get(model) || [];
    tags.push(tag);
    modelAIresMap.set(model, tags);
}
async function findRepositoryWithString(dirPath, searchString) {
    const results = [];
    const files = await fs.promises.readdir(dirPath, { withFileTypes: true });
    for (const file of files) {
        const fullPath = path.join(dirPath, file.name);
        if (file.isDirectory()) {
            // 재귀적으로 하위 디렉토리를 탐색
            await findRepositoryWithString(fullPath, searchString);
        }
        else if (file.isFile() && file.name.endsWith('.java')) {
            // Java 파일만 처리
            const fileContent = await fs.promises.readFile(fullPath, 'utf-8');
            if (fileContent.includes("@Repository")) {
                const match = fileContent.match(/JpaRepository<([^,]+),/);
                if (match && match[1]) {
                    const firstArgument = match[1].trim(); // 첫 번째 인자 추출 및 공백 제거
                    // 포함 여부 확인
                    if (firstArgument.includes(searchString)) {
                        const noExtRepo = file.name.replace('.java', '');
                        repository.push(noExtRepo); // 결과 추가
                        repositoryModelMap.set(noExtRepo, searchString);
                    }
                }
            }
        }
    }
    repository.push(...results);
}
async function findServiceWithString(dirPath, model, searchString, length) {
    const results = [];
    const files = await fs.promises.readdir(dirPath, { withFileTypes: true });
    for (const file of files) {
        const fullPath = path.join(dirPath, file.name);
        if (file.isDirectory()) {
            // 재귀적으로 하위 디렉토리를 탐색
            await findServiceWithString(fullPath, model, searchString, length);
        }
        else if (file.isFile() && file.name.endsWith('.java')) {
            // Java 파일만 처리
            const fileContent = await fs.promises.readFile(fullPath, 'utf-8');
            if (fileContent.includes("@Service")) {
                // 포함 여부 확인
                if (fileContent.includes(searchString)) {
                    results.push(file.name); // 결과 추가
                    extractSubstringFromKeyword(fileContent, model, searchString, length);
                }
            }
        }
    }
    service.push(...results);
}
const removeCommentLines = (input) => {
    // 문자열을 줄 단위로 분리
    const lines = input.split('\n');
    // 각 줄을 순회하며 '//'로 시작하지 않는 줄만 필터링
    const filteredLines = lines.filter(line => !line.trim().startsWith('//'));
    // 필터링된 줄들을 다시 합쳐서 반환
    return filteredLines.join('\n');
};
// 정규식으로 model 키워드 뒤의 모델명 추출
const extractModelNames = (input) => {
    const modelRegex = /erDiagram\s+([\w_]+)\s*{/g; // 'model' 키워드 뒤의 단어를 캡처
    const matches = [];
    let match;
    // 반복적으로 정규식 매칭 수행
    while ((match = modelRegex.exec(input)) !== null) {
        matches.push(match[1]); // 캡처된 그룹(모델 이름)을 추가
    }
    return matches;
};
// snake_case -> CamelCase
const toCamelCase = (snakeCase) => {
    return snakeCase
        .toLowerCase() // 모든 문자를 소문자로 변환
        .split('_') // 언더스코어(_)를 기준으로 문자열을 나눔
        .map((word, index) => {
        // 첫 번째 단어는 소문자로 유지
        // if (index === 0) {
        //   return word;
        // }
        // 첫 글자를 대문자로 변환
        return word.charAt(0).toUpperCase() + word.slice(1);
    })
        .join(''); // 배열을 다시 문자열로 합침
};
// 키워드 기점 length만큼 parse
function extractSubstringFromKeyword(inputString, model, keyword, length) {
    const result = [];
    let startIndex = inputString.indexOf(keyword);
    // 첫 번째 키워드의 위치를 찾고, 두 번째 키워드의 위치를 찾음
    if (startIndex !== -1) {
        startIndex = inputString.indexOf(keyword, startIndex + 1);
    }
    // 키워드가 문자열에 존재하는 경우
    if (startIndex !== -1) {
        // 키워드 위치부터 지정된 길이만큼 추출
        const substring = inputString.substring(startIndex, startIndex + length);
        // console.log(substring)
        // const processedStrings = substring.map(str =>
        //   str.replace(/^\+/, '').replace(/\r$/, '\r\n')
        // );
        // const combinedString = processedStrings.join('');
        addModelTag(model, substring);
    }
}
// const targetDirectory = './src'
const targetDirectory = 'C:/Users/LDCC/offshore/2025/플랫폼biz_대화형AI데모/chatbi-back/src'; // 탐색할 디렉토리 경로
// main
async function main() {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    // console.log(fileContent)
    const commentLines = removeCommentLines(fileContent);
    // console.log(`commentLines : ${commentLines}`)
    const modelNames = extractModelNames(commentLines);
    // console.log(`modelNames : ${modelNames}`)
    await Promise.all(modelNames.map((targetModel) => {
        findRepositoryWithString(targetDirectory, toCamelCase(targetModel));
        modelCamelSnake.set(targetModel, toCamelCase(targetModel));
    }));
    repository.forEach((fileName, index) => {
        repository[index] = fileName.replace('.java', '');
    });
    // console.log("Repository:", repository)
    // console.log("repositoryModelMap:", repositoryModelMap)
    await Promise.all(repository.map((targetRepository) => findServiceWithString(targetDirectory, toCamelCase(repositoryModelMap.get(targetRepository)), targetRepository, 4000)));
    // console.log("Service:", service)
    // console.log("modelServiceMap:", modelServiceMap)
    await processModelServiceMap();
    console.log(`modelAIresMap ${[...modelAIresMap]}`);
}
// 결과 출력
// console.log(modelNames);
// const searchString = 'RoleMstr'; // 검색할 문자열
// const repositoryPromises = [];
// 병렬 처리 함수
async function processModelServiceMap() {
    // 모든 작업을 Promise 배열로 저장
    const promises = [];
    // map 순회
    // for(const [model, services] of modelServiceMap){
    modelServiceMap.forEach((services, model) => {
        const promise = processModelServices(model, services);
        promises.push(promise);
    });
    // 모든 작업을 병렬로 실행
    await Promise.all(promises);
    console.log("모든 작업 완료!");
}
async function processModelServices(model, services) {
    console.log(`Processing model: ${model}`);
    await Promise.all(services.map(async (service) => {
        // 각 서비스에 대해 API 호출
        console.log(`Calling API for service: ${service}`);
        try {
            const response = await callSummaryApi(model, service);
        }
        catch (error) {
            console.error(`Error calling API for ${service}:`, error);
        }
    }));
}
async function callSummaryApi(model, service) {
    const apiUrl = "https://ai-openapi.lotte.net:32001/api/lottegpt";
    const token = "eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJoeXVuamlrLmxlZSIsImlzcyI6ImFpX3BsYXRmb3JtIiwiZ3JvdXAiOiIwMzMxMDAiLCJhdXRob3JpdGllcyI6IlJPTEVfVVNFUl9JRCIsInR5cGUiOiJBQ0NFU1MiLCJleHAiOjM4ODc2MDgwOTZ9.Av3kIIIa2HMlJfx0KUdKwN30xadIfC7AmZXNP2go8PlfqlGA_WpoOGmHqFaYYevr3fYCr17ZP2-Sjk7SDi2gkQ";
    const res = await fetch(apiUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ query: `아래 소스코드의 대표 기능을 5줄 이내로 요약해줘. ${service}`, history: "" }),
        // body: JSON.stringify({ query: "아이멤버가 뭐야", history: "" }),
    });
    if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.json}`);
    }
    // 응답 데이터를 JSON으로 파싱
    const data = await res.json();
    // 응답 데이터 사용
    console.log('API Response:', data.message);
    console.log('airesponse model:', model);
    addAIresponseTag(model, data.message);
}
async function callMermaidApi(schema) {
    console.log('callMermaidApi called with schema:', schema);
    const apiUrl = "https://ai-openapi.lotte.net:32001/api/lottegpt";
    const token = "eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJoeXVuamlrLmxlZSIsImlzcyI6ImFpX3BsYXRmb3JtIiwiZ3JvdXAiOiIwMzMxMDAiLCJhdXRob3JpdGllcyI6IlJPTEVfVVNFUl9JRCIsInR5cGUiOiJBQ0NFU1MiLCJleHAiOjM4ODc2MDgwOTZ9.Av3kIIIa2HMlJfx0KUdKwN30xadIfC7AmZXNP2go8PlfqlGA_WpoOGmHqFaYYevr3fYCr17ZP2-Sjk7SDi2gkQ";
    const res = await fetch(apiUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
            query: `아래 테이블 정보를 mermaid erdiagram 코드로 변환해줘. (추가 요구사항: 모두 대문자로 표기, 언급하지 않은 속성 정보는 제공 불필요, 1.타입 2.속성명 3. PK/FK여부 순으로 작성, 대괄호 아닌 중괄호 사용) ${schema}`,
            history: ""
        }),
    });
    if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
    }
    // 응답 데이터를 JSON으로 파싱
    const data = await res.json();
    console.log('Raw API Response:', data.message);
    return data.message;
}
/**
 * mermaidCode에서 ```로 둘러싸인 내부 내용만 추출하는 함수
 * @param input API 응답 문자열
 * @returns 추출된 테이블명과 {} 내용만 포함된 코드
 */
function extractMermaidCode(input) {
    console.log('extractMermaidCode called with input:', input);
    // ```로 둘러싸인 내용을 찾는 정규식
    const mermaidRegex = /```(?:mermaid)?\s*([\s\S]*?)```/g;
    let match;
    let extractedCode = '';
    // 모든 매치를 찾아서 첫 번째 것을 사용
    while ((match = mermaidRegex.exec(input)) !== null) {
        extractedCode = match[1].trim();
        console.log('Found mermaid code block:', extractedCode);
        break; // 첫 번째 매치만 사용
    }
    if (!extractedCode) {
        console.log('No mermaid code block found, returning original input');
        return input.trim();
    }
    // mermaid와 erDiagram 키워드 제거, 테이블명과 {} 내용만 추출
    const cleanedCode = extractedCode
        .replace(/^\s*mermaid\s*/gi, '') // mermaid 키워드 제거
        .replace(/^\s*erDiagram\s*/gi, '') // erDiagram 키워드 제거
        .replace(/decimal\(\d+,\d+\)/g, 'decimal') // decimal 타입 정리
        .replace(/\bTABLE\b/g, ' ') // TABLE 키워드 제거
        .replace(/^\s+|\s+$/g, '') // 앞뒤 공백 제거
        .trim();
    console.log('Cleaned mermaid code (table name and content only):', cleanedCode);
    return cleanedCode;
}
/**
 * mermaidCode에서 테이블명을 대문자로 치환하는 함수
 * @param mermaidCode "xxxx { }" 형태의 mermaid 코드
 * @returns 테이블명이 대문자로 변환된 코드
 */
function convertTableNameToUpperCase(mermaidCode) {
    console.log('convertTableNameToUpperCase called with:', mermaidCode);
    // "테이블명 { }" 형태를 찾는 정규식
    const tableNameRegex = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*\{/;
    const match = mermaidCode.match(tableNameRegex);
    if (match) {
        const originalTableName = match[1];
        const upperCaseTableName = originalTableName.toUpperCase();
        // 테이블명을 대문자로 치환
        const convertedCode = mermaidCode.replace(originalTableName, upperCaseTableName);
        console.log('Original table name:', originalTableName);
        console.log('Converted table name:', upperCaseTableName);
        console.log('Converted mermaid code:', convertedCode);
        return convertedCode;
    }
    else {
        console.log('No table name pattern found, returning original code');
        return mermaidCode;
    }
}
/**
 * AI 응답에서 특정 조건을 만족하는 라인만 추출하는 함수
 * @param aiResponse AI API 응답 문자열
 * @returns 조건을 만족하는 라인들만 포함된 문자열
 */
function extractRelationLines(aiResponse) {
    console.log('extractRelationLines called with:', aiResponse);
    // 문자열을 라인별로 분할
    const lines = aiResponse.split('\n');
    const filteredLines = [];
    // 각 라인을 검사
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        const trimmedLine = line.trim();
        // 한글 포함 여부 확인 (한글이 포함된 라인은 제외)
        const hasKorean = /[가-힣]/.test(trimmedLine);
        if (hasKorean) {
            console.log(`Line ${index + 1} contains Korean, skipping:`, trimmedLine);
            continue;
        }
        // 조건 확인: '--'가 포함되어 있고, 1:1, 1:N, N:N 중 하나가 포함된 라인
        const hasDash = trimmedLine.includes('--');
        const hasRelation = /1:1|1:N|N:N/.test(trimmedLine);
        if (hasDash && hasRelation) {
            console.log(`Line ${index + 1} matches criteria:`, trimmedLine);
            filteredLines.push(trimmedLine);
        }
    }
    const result = filteredLines.join('\n');
    console.log('Extracted relation lines:', result);
    console.log('Total matching lines:', filteredLines.length);
    return result;
}
/**
 * 추출된 관계 라인들을 모두 대문자로 변환하는 함수
 * @param extractedLines 추출된 관계 라인들
 * @returns 대문자로 변환된 관계 라인들
 */
function convertRelationLinesToUpperCase(extractedLines) {
    console.log('convertRelationLinesToUpperCase called with:', extractedLines);
    if (!extractedLines.trim()) {
        console.log('No lines to convert');
        return extractedLines;
    }
    // 라인별로 분할하여 각 라인을 대문자로 변환
    const lines = extractedLines.split('\n');
    const upperCaseLines = lines.map(line => {
        const upperCaseLine = line.toUpperCase();
        console.log('Converted line:', line, '→', upperCaseLine);
        return upperCaseLine;
    });
    const result = upperCaseLines.join('\n');
    console.log('Final uppercase lines:', result);
    return result;
}
// 기존 함수와의 호환성을 위한 별칭
function extractBeetweenBacktics(input) {
    return extractMermaidCode(input);
}
// 테스트용 함수 - mermaid 코드 추출 및 테이블명 대문자 변환 테스트
function testMermaidExtraction() {
    const testInputs = [
        `"
\`\`\`mermaid
erDiagram
    CHMM_USER_INFO {
        varchar(255) USER_ID PK
        varchar(255) USER_EMAIL
        varchar(14) USER_MOBILE
        varchar(255) USER_NAME
        varchar(255) USER_NICK
        varchar(255) USER_PWD
        varchar(4000) USER_IMG
        varchar(4000) USER_MSG
        varchar(1000) USER_DESC
        varchar(16) USER_STAT_CD
        varchar(255) USER_SNSID
        char(1) ACCOUNT_NON_LOCK
        varchar(8) ACCOUNT_START_DT
        varchar(8) ACCOUNT_END_DT
        varchar(8) PASSWORD_EXPIRE_DT
        char(1) USE_YN
        datetime SYS_INSERT_DTM
        varchar(255) SYS_INSERT_USER_ID
        datetime SYS_UPDATE_DTM
        varchar(255) SYS_UPDATE_USER_ID
        int PASSWORD_LOCK_CNT
        char(1) EXCEPTION_SEND_YN
        char(1) LOG_SEND_YN
        varchar(255) appointment
        varchar(255) department_id
        varchar(255) employee_id
        varchar(255) pms_authority
        varchar(255) position
    }
\`\`\`

위 테이블의 구조를 Mermaid 코드로 표현했습니다. \`USER_ID\`가 기본키(PK)로 설정되어 있고, 외래키(FK)는 명시되어 있지 않습니다. 모든 컬럼의 상세 정보는 제공되지 않았습니다.
"`
    ];
    testInputs.forEach((input, index) => {
        console.log(`Test ${index + 1}:`);
        console.log('Input:', input);
        const extractedCode = extractMermaidCode(input);
        console.log('Extracted code:', extractedCode);
        const convertedCode = convertTableNameToUpperCase(extractedCode);
        console.log('Converted code:', convertedCode);
        console.log('---');
    });
}
// 테스트용 함수 - 관계 라인 추출 및 대문자 변환 테스트
function testRelationLineExtraction() {
    const testInputs = [
        `이것은 테스트 응답입니다.
테이블A -- 1:N --> 테이블B
테이블B -- N:N --> 테이블C
테이블D -- 1:1 --> 테이블E
일반적인 텍스트 라인
테이블F --> 테이블G (관계 없음)
테이블H -- 1:N --> 테이블I
마지막 라인입니다.`,
        `다른 테스트 케이스:
USERS -- 1:N --> ORDERS
ORDERS -- 1:N --> ORDER_ITEMS
PRODUCTS -- N:N --> CATEGORIES
이것은 조건을 만족하지 않는 라인입니다.`,
        `혼합 테스트 케이스:
USERS -- 1:N --> ORDERS
사용자 테이블과 주문 테이블의 관계
ORDERS -- 1:N --> ORDER_ITEMS
주문 상세 정보 테이블
PRODUCTS -- N:N --> CATEGORIES
상품과 카테고리의 다대다 관계
CUSTOMERS -- 1:1 --> CUSTOMER_PROFILES
고객 프로필 정보`
    ];
    testInputs.forEach((input, index) => {
        console.log(`Relation Line Test ${index + 1}:`);
        console.log('Input:', input);
        const extractedLines = extractRelationLines(input);
        console.log('Extracted lines:', extractedLines);
        const upperCaseLines = convertRelationLinesToUpperCase(extractedLines);
        console.log('Uppercase lines:', upperCaseLines);
        console.log('---');
    });
}
/*******************************  VScode 패널  *******************************/
var panel = undefined;
const activePanels = new Map();
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
function activate(context) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "visualdb" is now active!');
    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
    const helloWorld = vscode.commands.registerCommand('visualdbforpms.helloWorld', () => {
        // The code you place here will be executed every time your command is executed
        // Display a message box to the user
        console.log('helloWorld');
        vscode.window.showInformationMessage('Hello World from visualdb!');
    });
    context.subscriptions.push(helloWorld);
    const callAIapi = vscode.commands.registerCommand('visualdbforpms.callAIapi', async () => {
        const apiUrl = "https://ai-openapi.lotte.net:32001/api/chatgpt";
        const token = "eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJoeXVuamlrLmxlZSIsImlzcyI6ImFpX3BsYXRmb3JtIiwiZ3JvdXAiOiIwMzMxMDAiLCJhdXRob3JpdGllcyI6IlJPTEVfVVNFUl9JRCIsInR5cGUiOiJBQ0NFU1MiLCJleHAiOjM4ODc2MDgwOTZ9.Av3kIIIa2HMlJfx0KUdKwN30xadIfC7AmZXNP2go8PlfqlGA_WpoOGmHqFaYYevr3fYCr17ZP2-Sjk7SDi2gkQ";
        const relation = `
      Relation 88:
  Child Table: chmm_code_info
  Parent Table: chmm_category_info
  Relationship Type: N:N

Relation 89:
  Child Table: pms_quotation_reference_system_customer_information_project
  Parent Table: pms_quotation_reference_system_customer_information
  Relationship Type: N:N

Relation 90:
  Child Table: pms_quotation_reference_system_customer_information_project
  Parent Table: pms_user
  Relationship Type: N:N

Relation 91:
  Child Table: pms_meeting_room
  Parent Table: pms_user
  Relationship Type: N:N

Relation 92:
  Child Table: pms_meeting_room
  Parent Table: pms_project
  Relationship Type: N:N

Relation 93:
  Child Table: pms_role
  Parent Table: pms_code
  Relationship Type: N:N

Relation 94:
  Child Table: pms_role
  Parent Table: pms_user
  Relationship Type: N:N

Relation 95:
  Child Table: pms_comment
  Parent Table: pms_comment
  Relationship Type: N:N

Relation 96:
  Child Table: pms_comment
  Parent Table: pms_user
  Relationship Type: N:N

Relation 97:
  Child Table: pms_comment
  Parent Table: pms_project
  Relationship Type: N:N
    `;
        const res = await fetch(apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                query: `아래 테이블 정보를 mermaid erdiagram 연관 코드로 변환해줘  ${relation}`,
                history: ""
            }),
        });
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        // 응답 데이터를 JSON으로 파싱
        const data = await res.json();
        console.log('Raw API Response:', data.message);
        return data.message;
    });
    context.subscriptions.push(callAIapi);
    context.subscriptions.push(vscode.commands.registerCommand('visualdbforpms.changeMermaid', async (tableNameInfo) => {
        console.log('changeMermaid');
        console.log('tableNameInfo:', tableNameInfo);
        // Mermaid 파일 쓰기가 진행 중이면 대기
        while (isMermaidFileWriting) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        try {
            isMermaidFileWriting = true; // 파일 쓰기 시작
            const rawMermaidResponse = await callMermaidApi(tableNameInfo);
            console.log('Raw mermaid API response:', rawMermaidResponse);
            // ```로 둘러싸인 내용만 추출
            const extractedMermaidCode = extractMermaidCode(rawMermaidResponse);
            console.log('Extracted mermaid code:', extractedMermaidCode);
            // 테이블명을 대문자로 변환
            const mermaidCode = convertTableNameToUpperCase(extractedMermaidCode);
            console.log('Final mermaid code with uppercase table name:', mermaidCode);
            // 파일 쓰기를 동기적으로 처리 (누적 저장)
            if (fs.existsSync(mermaidFilePath)) {
                // 파일이 존재하면 기존 내용에 추가
                fs.appendFileSync(mermaidFilePath, '\n\n' + mermaidCode, 'utf8');
            }
            else {
                // 파일이 없으면 새로 생성
                fs.writeFileSync(mermaidFilePath, mermaidCode, 'utf8');
            }
            vscode.window.showInformationMessage(`Mermaid 다이어그램 추가됨: ${mermaidFilePath}`);
        }
        catch (error) {
            console.error('Error in changeMermaid:', error);
            vscode.window.showErrorMessage(`Mermaid 변환 오류: ${error}`);
        }
        finally {
            isMermaidFileWriting = false; // 파일 쓰기 완료
        }
    }));
    // 테이블 정보 조회 명령어
    context.subscriptions.push(vscode.commands.registerCommand('visualdbforpms.fetchSchemas', async () => {
        try {
            vscode.window.showInformationMessage('fetchSchemas ran!');
            const schemas = await fetchAllTablesInfo('localpms');
        }
        catch (error) {
            console.error('Error fetching schemas:', error);
        }
    }));
    const dbAIsummary = vscode.commands.registerCommand('visualdbforpms.dbAIsummary', () => {
        // The code you place here will be executed every time your command is executed
        // Display a message box to the user
        vscode.window.showInformationMessage('dbAIsummary ran!');
        main();
    });
    context.subscriptions.push(dbAIsummary);
    const dbAIwebview = vscode.commands.registerCommand('visualdbforpms.dbAIwebview', () => {
        vscode.window.showInformationMessage('dbAIwebview ran!');
        // modelCamelSnake와 modelAIresMap 변수 초기화
        const modelCamelSnake = new Map();
        const modelAIresMap = new Map();
        // 웹뷰 HTML 콘텐츠 생성 함수
        const createWebviewContent = () => {
            try {
                const schemaContent = fs.readFileSync(filePath, 'utf-8');
                const arraySchema = schemaContent.match(/erDiagram[\s\S]*?\}/g) || [];
                // Mermaid 파일 내용 읽기
                const mermaidContent = readMermaidFile();
                return getHtmlForWebviewSchema(arraySchema, modelCamelSnake, modelAIresMap, mermaidContent);
            }
            catch (error) {
                console.error('Error creating webview content:', error);
                return '<html><body><h1>Error loading content</h1></body></html>';
            }
        };
        if (panel) {
            panel.reveal(vscode.ViewColumn.One);
        }
        else {
            panel = vscode.window.createWebviewPanel('chatGpt', 'VisualDB', vscode.ViewColumn.Beside, // Editor column to show the new webview panel in.
            {
                // 웹뷰에 표시될 내용에 대한 설정입니다.
                enableScripts: true, // JavaScript를 활성화합니다.
                retainContextWhenHidden: true, // 웹뷰가 비활성화될 때 상태를 유지합니다.
            });
            panel.webview.onDidReceiveMessage(message => {
                switch (message.command) {
                    case 'startChat':
                        console.log('Start chat command received from the webview');
                        return;
                    case 'refresh':
                        console.log('Refresh command received from the webview');
                        if (panel) {
                            panel.webview.html = createWebviewContent();
                        }
                        return;
                }
            }, undefined, context.subscriptions);
            // 패널이 닫힐 때 panel 객체를 undefined로 설정합니다.
            panel.onDidDispose(() => {
                panel = undefined;
            });
        }
        // Webview에 HTML 콘텐츠 설정
        panel.webview.html = createWebviewContent();
    });
    context.subscriptions.push(dbAIwebview);
    // originFilePath 파일 삭제 명령어
    const deleteOriginFile = vscode.commands.registerCommand('visualdbforpms.deleteOriginFile', () => {
        deleteOriginSchemasFile();
    });
    context.subscriptions.push(deleteOriginFile);
    // mermaidFilePath 파일 삭제 명령어
    const deleteMermaidFile = vscode.commands.registerCommand('visualdbforpms.deleteMermaidFile', () => {
        try {
            if (fs.existsSync(mermaidFilePath)) {
                fs.unlinkSync(mermaidFilePath);
                console.log('Successfully deleted mermaid file:', mermaidFilePath);
                vscode.window.showInformationMessage(`Deleted mermaid file: ${mermaidFilePath}`);
            }
            else {
                console.log('Mermaid file does not exist:', mermaidFilePath);
                vscode.window.showInformationMessage(`Mermaid file does not exist: ${mermaidFilePath}`);
            }
        }
        catch (error) {
            console.error('Error deleting mermaid file:', error);
            vscode.window.showErrorMessage(`Error deleting mermaid file: ${error}`);
        }
    });
    context.subscriptions.push(deleteMermaidFile);
    // relationFilePath 파일 삭제 명령어
    const deleteRelationFile = vscode.commands.registerCommand('visualdbforpms.deleteRelationFile', () => {
        try {
            if (fs.existsSync(relationFilePath)) {
                fs.unlinkSync(relationFilePath);
                console.log('Successfully deleted relation file:', relationFilePath);
                vscode.window.showInformationMessage(`Deleted relation file: ${relationFilePath}`);
            }
            else {
                console.log('Relation file does not exist:', relationFilePath);
                vscode.window.showInformationMessage(`Relation file does not exist: ${relationFilePath}`);
            }
            // JSON 파일도 삭제
            const jsonFilePath = path.join(__dirname, 'relations.json');
            if (fs.existsSync(jsonFilePath)) {
                fs.unlinkSync(jsonFilePath);
                console.log('Successfully deleted relation JSON file:', jsonFilePath);
                vscode.window.showInformationMessage(`Deleted relation JSON file: ${jsonFilePath}`);
            }
        }
        catch (error) {
            console.error('Error deleting relation file:', error);
            vscode.window.showErrorMessage(`Error deleting relation file: ${error}`);
        }
    });
    context.subscriptions.push(deleteRelationFile);
    // AI 분석 파일 삭제 명령어
    const deleteAIAnalysisFiles = vscode.commands.registerCommand('visualdbforpms.deleteAIAnalysisFiles', () => {
        try {
            const aiResponseFilePath = path.join(__dirname, 'ai_relation_analysis.txt');
            if (fs.existsSync(aiResponseFilePath)) {
                fs.unlinkSync(aiResponseFilePath);
                console.log('Successfully deleted AI analysis file:', aiResponseFilePath);
                vscode.window.showInformationMessage('Deleted AI analysis file: ai_relation_analysis.txt');
            }
            else {
                console.log('AI analysis file does not exist:', aiResponseFilePath);
                vscode.window.showInformationMessage('AI analysis file does not exist: ai_relation_analysis.txt');
            }
        }
        catch (error) {
            console.error('Error deleting AI analysis file:', error);
            vscode.window.showErrorMessage(`Error deleting AI analysis file: ${error}`);
        }
    });
    context.subscriptions.push(deleteAIAnalysisFiles);
    const getRelationInfoCommand = vscode.commands.registerCommand('visualdbforpms.getRelationInfo', async () => {
        try {
            console.log('getRelationInfo ran!');
            const relationInfo = await getRelationInfo('localpms');
            console.log(`Relation info: ${relationInfo}`);
            // relationInfo를 파일에 저장
            await saveRelationInfoToFile(relationInfo);
            // 1. AI 분석 파일 초기화
            const aiResponseFilePath = path.join(__dirname, 'ai_relation_analysis.txt');
            if (fs.existsSync(aiResponseFilePath)) {
                fs.unlinkSync(aiResponseFilePath);
                console.log('Deleted existing AI analysis file');
            }
            // 빈 파일 생성
            fs.writeFileSync(aiResponseFilePath, '', 'utf8');
            console.log('Initialized AI analysis file');
            // 2. JSON 파일에서 관계 데이터 읽기
            const jsonFilePath = path.join(__dirname, 'relations.json');
            if (!fs.existsSync(jsonFilePath)) {
                throw new Error('relations.json file not found');
            }
            const relationData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
            console.log('Loaded relation data from JSON:', relationData.length, 'relations');
            // 2. 10개씩 배치로 나누기
            const BATCH_SIZE = 10;
            const batches = [];
            for (let i = 0; i < relationData.length; i += BATCH_SIZE) {
                batches.push(relationData.slice(i, i + BATCH_SIZE));
            }
            console.log(`Processing ${batches.length} batches of ${BATCH_SIZE} relations each`);
            // 3. 각 배치에 대해 AI API 호출
            for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
                const batch = batches[batchIndex];
                console.log(`Processing batch ${batchIndex + 1}/${batches.length} with ${batch.length} relations`);
                try {
                    // AI API 호출
                    const aiResponse = await callAIRelationApi(batch);
                    // AI 응답에서 관계 라인만 추출
                    const extractedLines = extractRelationLines(aiResponse);
                    // 추출된 라인들을 대문자로 변환
                    const upperCaseLines = convertRelationLinesToUpperCase(extractedLines);
                    // 대문자로 변환된 라인들을 파일에 저장
                    await saveAIResponseToFile(batchIndex, upperCaseLines);
                    console.log(`Batch ${batchIndex + 1} processed successfully`);
                    // 배치 간 대기 (API 부하 방지)
                    if (batchIndex < batches.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
                catch (error) {
                    console.error(`Error processing batch ${batchIndex + 1}:`, error);
                    // 에러가 있어도 다음 배치 계속 처리
                }
            }
            vscode.window.showInformationMessage(`Relation info processed: ${relationInfo.length} relationships, ${batches.length} batches analyzed`);
        }
        catch (error) {
            console.error('Error fetching relation info:', error);
            vscode.window.showErrorMessage(`Error fetching relation info: ${error}`);
        }
    });
    context.subscriptions.push(getRelationInfoCommand);
    // Mermaid 코드 추출 테스트 명령어
    const testMermaidExtractionCommand = vscode.commands.registerCommand('visualdbforpms.testMermaidExtraction', () => {
        console.log('Testing mermaid extraction...');
        testMermaidExtraction();
        vscode.window.showInformationMessage('Mermaid extraction test completed. Check console for results.');
    });
    context.subscriptions.push(testMermaidExtractionCommand);
}
// This method is called when your extension is deactivated
function deactivate() { }
function getHtmlForWebviewSchema(schema, modelCamelSnake, modelAIresMap, mermaidContent = '') {
    // const md = require('markdown-it')();
    // const html = md.render(markdown);
    console.log(`modelAIresMap: ${modelAIresMap}`);
    console.log(`modelAIresMap: ${JSON.stringify(modelAIresMap)}`);
    const modelAIresMapJson = JSON.stringify(Object.fromEntries(modelAIresMap)); // Map 객체를 JSON 문자열로 변환
    console.log(`modelAIresMapJson: ${modelAIresMapJson}`);
    // mermaidFilePath 파일 내용을 읽어오기
    let mermaidFileContent = '';
    try {
        if (fs.existsSync(mermaidFilePath)) {
            mermaidFileContent = fs.readFileSync(mermaidFilePath, 'utf8');
            console.log('Mermaid file content loaded:', mermaidFileContent);
        }
        else {
            console.log('Mermaid file does not exist');
        }
    }
    catch (error) {
        console.error('Error reading mermaid file:', error);
    }
    return `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>ER Diagram</title>
        <style>
        .popup {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background-color: white;
          border: 1px solid #ccc;
          padding: 20px;
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
          z-index: 1000;
          display: none;
        }
        .popup-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(0, 0, 0, 0.5);
          z-index: 999;
          display: none;
        }
        .container {
          width: 100%;
          height: 100%;
          padding: 20px;
          overflow-y: auto;
        }
        .mermaid {
          margin-bottom: 20px;
          padding: 15px;
          border: 1px solid #ddd;
          border-radius: 8px;
          background: #f9f9f9;
        }
        .mermaid-file-section {
          margin-top: 30px;
          padding: 20px;
          background: #f0f8ff;
          border-radius: 10px;
          border: 2px solid #007acc;
        }
        .mermaid-file-title {
          font-size: 18px;
          font-weight: bold;
          color: #007acc;
          margin-bottom: 15px;
          text-align: center;
        }
        </style>



			</head>
			<body>
        <script type="module">
					import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
          					mermaid.initialize({
						startOnLoad: true,
						securityLevel: 'loose', // Strict Mode 비활성화
					});
				</script>

        <div style="padding: 10px; background: #f0f0f0; border-bottom: 1px solid #ccc;">
          <button id="refresh-btn" style="padding: 8px 16px; background: #007acc; color: white; border: none; border-radius: 4px; cursor: pointer;">
            🔄 새로고침
          </button>
          <span id="status" style="margin-left: 10px; color: #666;"></span>
        </div>
        <div class="container">
        </div>
        <!-- Popup elements -->
        <div class="popup-overlay" id="popup-overlay"></div>
        <div class="popup" id="popup">
          <p id="popup-content"></p>
          <button id="popup-close">Close</button>
        </div>

        <script>
          const modelAIresMap = ${modelAIresMapJson}
          const mermaidContent = \`${mermaidContent}\`;
          const mermaidFileContent = \`${mermaidFileContent}\`;
          console.log('Model AI Res Map:', modelAIresMap['PARTYROLEREL']);
          console.log('Mermaid Content:', mermaidContent);
          console.log('Mermaid File Content:', mermaidFileContent);
          // console.log(${JSON.stringify(schema)})
          let mermaidContainer;
          document.addEventListener('DOMContentLoaded', () => {
            mermaidContainer = document.querySelector('.container');
            if (!mermaidContainer) {
              console.log('erorrororor')
              console.error("No <div class='mermaid'> element found in the DOM.");
            }
            const modelRegex = /erDiagram\s+([\w_]+)\s*{/g; // 'model' 키워드 뒤의 단어를 캡처

            // 기존 스키마 다이어그램 추가
            console.log('modelAIresMap : ' + Object.values(${JSON.stringify(modelAIresMap)}));
            ${JSON.stringify(schema)}.forEach((block, index) => {
                match = modelRegex.exec(block)
                const diagramDiv = document.createElement('div');
                diagramDiv.className = 'mermaid';
                diagramDiv.textContent = block.trim(); // 다이어그램 텍스트 추가
                diagramDiv.style.cursor = 'pointer'
                diagramDiv.addEventListener('click', () => showPopup(index))
                mermaidContainer.appendChild(diagramDiv); // 컨테이너에 추가
                console.log(diagramDiv)
            });

            // mermaidContent 처리 (있는 경우)
            // if (mermaidContent && mermaidContent.trim()) {
            if (mermaidContent) {
              const diagramDiv = document.createElement('div');
              diagramDiv.className = 'mermaid';
              diagramDiv.textContent = mermaidContent.trim();
              diagramDiv.style.cursor = 'pointer';
              diagramDiv.style.marginTop = '20px';
              diagramDiv.style.border = '1px solid #ddd';
              diagramDiv.style.padding = '10px';
              //diagramDiv.addEventListener('click', () => showMermaidPopup(mermaidContent.trim()));
              mermaidContainer.appendChild(diagramDiv);
              console.log('Added mermaid content:', mermaidContent.trim());
            }

            // 팝업 관련 요소
          const popupOverlay = document.getElementById('popup-overlay');
          const popup = document.getElementById('popup');
          const popupContent = document.getElementById('popup-content');
          const popupClose = document.getElementById('popup-close');

          // 팝업 표시 함수
          function showPopup(index) {
            popupContent.textContent = \`Aichatmstr,이 코드는 AI 채팅 마스터(AiChatMstr)를 생성하는 기능을 수행합니다. 
                      주요 기능은 다음과 같습니다:
             <br>1. 현재 로그인한 사용자의 정보를 확인하여, 조직 파티 ID와 사용자 파티 ID를 설정합니다.

             <br>2. 시작 날짜(strDate)가 제공되지 않으면 현재 시점으로 설정합니다.

             <br>3. 종료 날짜(endDate)는 기본적으로 9999년 12월 31일로 설정됩니다.

             <br>4. AI 채팅 마스터 엔티티를 생성하고 저장합니다.

             <br>5. 생성된 AI 채팅 마스터 데이터를 DTO 형태로 반환합니다.\` || 'No comments available.';
            popupOverlay.style.display = 'block';
            popup.style.display = 'block';
          }

          // Mermaid 팝업 표시 함수
          function showMermaidPopup(mermaidCode) {
            popupContent.innerHTML = \`<h3>Mermaid Diagram Code:</h3><pre style="background: #f5f5f5; padding: 10px; border-radius: 5px; overflow-x: auto;">\${mermaidCode}</pre>\`;
            popupOverlay.style.display = 'block';
            popup.style.display = 'block';
          }

          // 팝업 닫기 함수
          function closePopup() {
            popupOverlay.style.display = 'none';
            popup.style.display = 'none';
          }

          // 닫기 버튼 및 오버레이 클릭 이벤트 추가
          popupClose.addEventListener('click', closePopup);
          popupOverlay.addEventListener('click', closePopup);

          // 새로고침 버튼 이벤트 추가
          const refreshBtn = document.getElementById('refresh-btn');
          const statusSpan = document.getElementById('status');
          
          if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
              statusSpan.textContent = '새로고침 중...';
              // VS Code extension에 새로고침 메시지 전송
              const vscode = acquireVsCodeApi();
              vscode.postMessage({ command: 'refresh' });
              
              // 1초 후 상태 초기화
              setTimeout(() => {
                statusSpan.textContent = '완료!';
                setTimeout(() => {
                  statusSpan.textContent = '';
                }, 2000);
              }, 1000);
            });
          }



          })


        </script>
			</body>
			</html>
		`;
}
function getHtmlForWebview(mapData) {
    // const md = require('markdown-it')();
    // const html = md.render(markdown);
    const mapDataJson = JSON.stringify(Object.fromEntries(mapData));
    return `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>ER Diagram</title>
			</head>
			<body>
        
        <div>
        </div>
        <div id="mapDisplay">
        </div>
        <div id="test">
        </div>
        <script>
          const mapData = ${mapDataJson}
          function formatStringWithNewlines(input) {
              // 정규식을 사용하여 숫자.로 시작하는 경우 앞에 개행 추가
            const formattedString = input.replace(/(\d+\.)/g, '\\n$1');
            return formattedString.trim(); // 문자열 앞뒤 공백 제거
          }


          function displayMapData(mapData) {
            console.log('hihi')
            const mapDisplay = document.getElementById('mapDisplay')
            console.log(mapDisplay)
            if(!mapDisplay) {
              console.log('!mapDisplay')
              return;
            }
            for (const key in mapData) {
              console.log('for문 입장')
              // 키를 표시
              console.log('키 표시')
              const keyElement = document.createElement('div')
              keyElement.className = 'map-key'
              keyElement.textContent = key

              // 값(배열)을 표시
              console.log('값 표시')
              const valueElement = document.createElement('ul')
              valueElement.className = 'map-value'
              mapData[key].forEach(item => {
                const listItem = document.createElement('li')
                listItem.textContent = formatStringWithNewlines(item)
                valueElement.appendChild(listItem)
              })

              // 키와 값 추가
              console.log('키와 값 표시')
              const container = document.createElement('div')
              container.className='map-container'
              container.appendChild(keyElement)
              container.appendChild(valueElement)
              console.log('최종 appendchild')
              mapDisplay.appendChild(container)
              
            }
            console.log(mapDisplay)
          }
          console.log('hihi2')
          displayMapData(mapData)
        </script>
			</body>
			</html>
		`;
}
//# sourceMappingURL=extension.js.map