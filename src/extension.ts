// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as mysql from 'mysql2/promise';


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
const pdffilePath = path.join(__dirname, 'schemas.pdf')


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
    async function getTableNames(connection: any, schemaName: string): Promise<string[]> {
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
        
        const tableNames = (result as any[]).map((row:any) => {
          // 여러 가능한 컬럼명을 시도
          const tableName = row.table_name || row.TABLE_NAME || row.Table_Name;
          console.log('Row:', row, 'Extracted table name:', tableName);
          return tableName;
        });
        console.log('Processed table names:', tableNames);
        return tableNames;
      } catch (error) {
        console.error('Error fetching table names:', error);
        throw error;
      }
    }


// 특정 테이블의 컬럼 정보 가져오기 (연결을 외부에서 받음)
async function getTableInfoWithConnection(connection: any, schemaName: string, tableName: string): Promise<any[]> {
  try {
    
    const query = `
      SELECT 
          c.TABLE_NAME AS table_name,
          c.COLUMN_NAME AS column_name,
          c.COLUMN_TYPE AS column_type,
          c.IS_NULLABLE AS is_nullable,
          c.COLUMN_KEY AS column_key,
          CASE 
              WHEN c.COLUMN_KEY = 'PRI' THEN 'PK'
              WHEN kcu.REFERENCED_TABLE_NAME IS NOT NULL THEN 'FK'
              ELSE 'None'
          END AS key_type
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
    return rows as any[]; // 컬럼 정보 배열 반환
  } catch (error) {
    console.error(`Error fetching info for table ${tableName}:`, error);
    throw error;
  }
}

// 특정 테이블의 컬럼 정보 가져오기 (기존 함수 - 호환성 유지)
async function getTableInfo(schemaName: string, tableName: string): Promise<any[]> {
  const connection = createConnection();
  try {
    const tableInfo = await getTableInfoWithConnection(connection, schemaName, tableName);
    return tableInfo;
  } catch (error) {
    console.error(`Error fetching info for table ${tableName}:`, error);
    throw error;
  } finally {
    await connection.end();
  }
}

// 파일에 스키마 정보를 저장하는 함수
function saveSchemasToFile(schemas: string): void {
  // const data = schemas.join('\n'); // 스키마 이름을 줄바꿈으로 구분
  if (fs.existsSync(filePath)) {
    // 파일이 이미 존재하면 업데이트
    console.log('File exists. Updating...');
    fs.appendFileSync(filePath, schemas + '\n', 'utf8');
  } else {
    // 파일이 없으면 새로 생성
    console.log('File does not exist. Creating new file...');
    fs.writeFileSync(filePath, schemas + '\n', 'utf8');
  }
  console.log('Schemas saved to file:', filePath);
}

// 파일에 스키마 정보를 저장하는 함수
function saveOriginSchemasToFile(schemas: string): void {
  // const data = schemas.join('\n'); // 스키마 이름을 줄바꿈으로 구분
  if (fs.existsSync(originFilePath)) {
    // 파일이 이미 존재하면 업데이트
    console.log('File exists. Updating...');
    fs.appendFileSync(originFilePath, schemas + '\n', 'utf8');
  } else {
    // 파일이 없으면 새로 생성
    console.log('File does not exist. Creating new file...');
    fs.writeFileSync(originFilePath, schemas + '\n', 'utf8');
  }
  console.log('Schemas saved to file:', originFilePath);
}

// originFilePath 파일 삭제 함수
function deleteOriginSchemasFile(): void {
  try {
    if (fs.existsSync(originFilePath)) {
      fs.unlinkSync(originFilePath);
      console.log('Successfully deleted file:', originFilePath);
      vscode.window.showInformationMessage(`Deleted file: ${originFilePath}`);
    } else {
      console.log('File does not exist:', originFilePath);
      vscode.window.showInformationMessage(`File does not exist: ${originFilePath}`);
    }
  } catch (error) {
    console.error('Error deleting file:', error);
    vscode.window.showErrorMessage(`Error deleting file: ${error}`);
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
async function fetchAllTablesInfo(schemaName: string) {
  try {
    // 0. 기존 파일 삭제
    
    // 1. 테이블 이름 가져오기
    const connection = createConnection();
    const tableNames = await getTableNames(connection, schemaName);
    console.log(`Found tables in schema "${schemaName}":`, tableNames);
    
    // 2. 각 테이블의 정보 가져오기
    for (const tableName of tableNames) {
      console.log(`Fetching info for table: ${tableName}`);
      const tableInfo = await getTableInfoWithConnection(connection, schemaName, tableName);
      console.log(`Info for table "${tableName}":`, tableInfo);
      vscode.window.showInformationMessage(`Info for table "${tableName}": ${JSON.stringify(tableInfo)}`);
      // 3. 파일에 테이블 이름 저장
      saveOriginSchemasToFile(tableName)
      // 4. 파일에 테이블 정보 저장
      saveOriginSchemasToFile(`${JSON.stringify(tableInfo)}`);
      fs.appendFileSync(filePath,'\n', 'utf8');
    }
    
  } catch (error) {
    console.error('Error fetching tables info:', error);
  }
}


/******************************* AImember 통신 *******************************/


const repository: string[] = [];
const service: string[] = [];
const prompt  : string[] = [];
const modelCamelSnake = new Map<string, string>();
const repositoryModelMap = new Map<string, string>();
const modelServiceMap = new Map<string, string[]>();
const modelAIresMap = new Map<string, string[]>();


// 모델 서비스 태그 추가 함수
function addModelTag(model: string, tag: string) {
    const tags = modelServiceMap.get(model) || [];
    tags.push(tag);
    modelServiceMap.set(model, tags);
}

// 모델에 대한 ai 응답 태그 추가 함수
function addAIresponseTag(model: string, tag: string) {
    const tags = modelAIresMap.get(model) || [];
    tags.push(tag);
    modelAIresMap.set(model, tags);
}


async function findRepositoryWithString(dirPath: string, searchString: string): Promise<void> {
  const results: string[] = [];
  const files = await fs.promises.readdir(dirPath, { withFileTypes: true });

  for (const file of files) {
    const fullPath = path.join(dirPath, file.name);

    if (file.isDirectory()) {
      // 재귀적으로 하위 디렉토리를 탐색
      await findRepositoryWithString(fullPath, searchString);
    } else if (file.isFile() && file.name.endsWith('.java')) {
      // Java 파일만 처리
      const fileContent = await fs.promises.readFile(fullPath, 'utf-8');
      if (fileContent.includes("@Repository") ){
        const match = fileContent.match(/JpaRepository<([^,]+),/);
        if (match && match[1]) {
          const firstArgument = match[1].trim(); // 첫 번째 인자 추출 및 공백 제거
          // 포함 여부 확인
          if (firstArgument.includes(searchString)) {
            const noExtRepo = file.name.replace('.java', '');
            repository.push(noExtRepo); // 결과 추가
            repositoryModelMap.set(noExtRepo, searchString)
          } 
        }
      }
    }
  }
  repository.push(...results);

}

async function findServiceWithString(dirPath: string, model: string, searchString: string, length: number): Promise<void> {
  const results: string[] = [];
  const files = await fs.promises.readdir(dirPath, { withFileTypes: true });
  for (const file of files) {
    const fullPath = path.join(dirPath, file.name);

    if (file.isDirectory()) {
      // 재귀적으로 하위 디렉토리를 탐색
      await findServiceWithString(fullPath, model, searchString, length);
    } else if (file.isFile() && file.name.endsWith('.java')) {
      // Java 파일만 처리
      const fileContent = await fs.promises.readFile(fullPath, 'utf-8');
      if (fileContent.includes("@Service") ){
          // 포함 여부 확인
          if (fileContent.includes(searchString)) {
            results.push(file.name); // 결과 추가
            extractSubstringFromKeyword(fileContent, model, searchString, length)
          } 

      }
    }
  }
  service.push(...results);

}


// 모델코드
const code = `
/// This model or at least one of its fields has comments in the database, and requires an additional setup for migrations: Read more: https://pris.ly/d/database-comments
model ai_answr_eval_record {
  ai_answr_eval_id    String    @id(map: "ai_answr_eval_record_pk") @db.VarChar(100)
  ai_chat_qstn_id     String    @db.VarChar(100)
  ai_answr_eval_score Int
  crt_party_id        Decimal   @db.Decimal(10, 0)
  str_date            DateTime  @db.Timestamp(6)
  mod_date            DateTime? @db.Timestamp(6)
  ai_qstn_type_code   String?   @db.VarChar(5)
}

/// This model or at least one of its fields has comments in the database, and requires an additional setup for migrations: Read more: https://pris.ly/d/database-comments
model ai_chat_mstr {
  ai_chat_id    String    @id(map: "ai_chat_mstr_pk") @db.VarChar(100)
  org_party_id  Decimal   @db.Decimal(10, 0)
  user_party_id Decimal   @db.Decimal(10, 0)
  str_date      DateTime? @db.Timestamp(6)
  end_date      DateTime? @db.Timestamp(6)
}
`;

const removeCommentLines = (input: string): string => {
  // 문자열을 줄 단위로 분리
  const lines = input.split('\n');

  // 각 줄을 순회하며 '//'로 시작하지 않는 줄만 필터링
  const filteredLines = lines.filter(line => !line.trim().startsWith('//'));

  // 필터링된 줄들을 다시 합쳐서 반환
  return filteredLines.join('\n');
};

// 정규식으로 model 키워드 뒤의 모델명 추출
const extractModelNames = (input: string): string[] => {
  const modelRegex = /erDiagram\s+([\w_]+)\s*{/g; // 'model' 키워드 뒤의 단어를 캡처
  const matches: string[] = [];
  let match;

  // 반복적으로 정규식 매칭 수행
  while ((match = modelRegex.exec(input)) !== null) {
    matches.push(match[1]); // 캡처된 그룹(모델 이름)을 추가
  }

  return matches;
};


// snake_case -> CamelCase
const toCamelCase = (snakeCase: string): string => {
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
function extractSubstringFromKeyword(
  inputString: string,
  model: string,
  keyword: string,
  length: number
) {
  const result: string[] = [];
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
    addModelTag(model, substring)
  }
}


// const targetDirectory = './src'
const targetDirectory = 'C:/Users/LDCC/offshore/2025/플랫폼biz_대화형AI데모/chatbi-back/src'; // 탐색할 디렉토리 경로

// main
async function main() {
  const fileContent = fs.readFileSync(filePath, 'utf-8')
  // console.log(fileContent)
  const commentLines = removeCommentLines(fileContent)
  // console.log(`commentLines : ${commentLines}`)
  const modelNames = extractModelNames(commentLines)
  // console.log(`modelNames : ${modelNames}`)
  
  await Promise.all(modelNames.map((targetModel)=> 
    {
    findRepositoryWithString(targetDirectory, toCamelCase(targetModel))
    modelCamelSnake.set(targetModel, toCamelCase(targetModel))
    }
  ))

  repository.forEach((fileName, index) => {
    repository[index] = fileName.replace('.java', '');
  })
  // console.log("Repository:", repository)
  // console.log("repositoryModelMap:", repositoryModelMap)
  await Promise.all(repository.map((targetRepository)=>findServiceWithString(targetDirectory, toCamelCase(repositoryModelMap.get(targetRepository) as string), targetRepository, 4000)))
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
    const promises: Promise<void>[] = [];

    // map 순회
    // for(const [model, services] of modelServiceMap){
    modelServiceMap.forEach((services, model)=>{
      const promise = processModelServices(model, services)
      promises.push(promise)
    })
    // 모든 작업을 병렬로 실행
    await Promise.all(promises);
    console.log("모든 작업 완료!")
  }
  async function processModelServices(model: string, services: string[]): Promise<void> {
    console.log(`Processing model: ${model}`)
    await Promise.all(
      services.map(async (service) => {
        // 각 서비스에 대해 API 호출
        console.log(`Calling API for service: ${service}`)
        try {
          const response = await callSummaryApi(model, service)
        } catch (error) {
          console.error(`Error calling API for ${service}:`,error)
        }
      })
    )
  }

  async function callSummaryApi(model: string, service: string): Promise<any> {
    const apiUrl = "https://ai-openapi.lotte.net:32001/api/lottegpt"
    const token = "eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJoeXVuamlrLmxlZSIsImlzcyI6ImFpX3BsYXRmb3JtIiwiZ3JvdXAiOiIwMzMxMDAiLCJhdXRob3JpdGllcyI6IlJPTEVfVVNFUl9JRCIsInR5cGUiOiJBQ0NFU1MiLCJleHAiOjM4ODc2MDgwOTZ9.Av3kIIIa2HMlJfx0KUdKwN30xadIfC7AmZXNP2go8PlfqlGA_WpoOGmHqFaYYevr3fYCr17ZP2-Sjk7SDi2gkQ"
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
    const data = await res.json() as { message: string };

    // 응답 데이터 사용
    console.log('API Response:', data.message);
    console.log('airesponse model:', model)
    addAIresponseTag(model, data.message)

  }


    async function callMermaidApi(schema: string): Promise<any> {
    const apiUrl = "https://ai-openapi.lotte.net:32001/api/lottegpt"
    const token = "eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJoeXVuamlrLmxlZSIsImlzcyI6ImFpX3BsYXRmb3JtIiwiZ3JvdXAiOiIwMzMxMDAiLCJhdXRob3JpdGllcyI6IlJPTEVfVVNFUl9JRCIsInR5cGUiOiJBQ0NFU1MiLCJleHAiOjM4ODc2MDgwOTZ9.Av3kIIIa2HMlJfx0KUdKwN30xadIfC7AmZXNP2go8PlfqlGA_WpoOGmHqFaYYevr3fYCr17ZP2-Sjk7SDi2gkQ"
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ query: `아래 테이블 정보를 mermaid 코드로 변환해줘. 언급하지 않은 속성 정보는 제공하지마. ${schema}`, history: "" }),
      // body: JSON.stringify({ query: "아이멤버가 뭐야", history: "" }),
    });

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.json}`);
    }

    // 응답 데이터를 JSON으로 파싱
    const data = await res.json() as { message: string };
    console.log('API Response:', data.message);
    return data.message;
    // 응답 데이터 사용



  }

  function extractBeetweenBacktics(input: string): string {
    const regex = /```([\s\S]*?)```/g;
    const regexDecimal = /decimal\(\d+,\d+\)/g;
    const matches = [];
    let match;
   
    if((match = regex.exec(input)) !== null){
      return match[1].replace(regexDecimal, "decimal").replace(/mermaid/g, '').replace(/TABLE/g, ' ');
      
    } 
    return '';
  }





  /*******************************  VScode 패널  *******************************/

var panel: vscode.WebviewPanel | undefined = undefined;

type PanelState = {
  panel: vscode.WebviewPanel;
  history: { question: string; answer: string }[];
  initialPrompt: string;
  firstRenderSent: boolean;
};

const activePanels = new Map<string, PanelState>();



// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "visualdb" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const helloWorld = vscode.commands.registerCommand('visualdbforpms.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
    // Display a message box to the user
    console.log('helloWorld')
		vscode.window.showInformationMessage('Hello World from visualdb!');
	});

	context.subscriptions.push(helloWorld);



  context.subscriptions.push(
      vscode.commands.registerCommand('visualdbforpms.fetchSchemas', async () => {
        try {
          vscode.window.showInformationMessage('fetchSchemas ran!');
          
          // filePath 파일 삭제
          // if (fs.existsSync(filePath)) {
          //   fs.unlinkSync(filePath);
          //   console.log('Deleted file:', filePath);
          // }
          
          // originFilePath 파일 삭제
          if (fs.existsSync(originFilePath)) {
            fs.unlinkSync(originFilePath);
            console.log('Deleted file:', originFilePath);
          }
          const schemas = await fetchAllTablesInfo('localpms');
        } catch (error) {
          console.error('Error fetching schemas:', error);
        }
      })
    );



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
    const modelCamelSnake = new Map<string, string>();
    const modelAIresMap = new Map<string, string[]>();
    
		if(panel) {
      panel.reveal(vscode.ViewColumn.One)
    }
    else {
      panel = vscode.window.createWebviewPanel(
        'chatGpt',
        'VisualDB',
        vscode.ViewColumn.Beside, // Editor column to show the new webview panel in.
        {
          // 웹뷰에 표시될 내용에 대한 설정입니다.
          enableScripts: true, // JavaScript를 활성화합니다.
          retainContextWhenHidden: true, // 웹뷰가 비활성화될 때 상태를 유지합니다.
        }
      );
      panel.webview.onDidReceiveMessage(
        message => {
          switch (message.command) {
            case 'startChat':
              console.log('Start chat command received from the webview');
              return;
          }
        },
        undefined,
        context.subscriptions
      );
      // 패널이 닫힐 때 panel 객체를 undefined로 설정합니다.
      panel.onDidDispose(() => {
        panel = undefined;
      });
      }
      // 웹뷰에 표시할 HTML을 설정합니다.
      const schemaContent = fs.readFileSync(filePath, 'utf-8');
      const arraySchema = schemaContent.match(/erDiagram[\s\S]*?\}/g) || [];
      const htmlContent = getHtmlForWebviewSchema(arraySchema, modelCamelSnake, modelAIresMap);
      // Webview에 HTML 콘텐츠 설정
      panel.webview.html = htmlContent;
    }
	);
	context.subscriptions.push(dbAIwebview);

  // originFilePath 파일 삭제 명령어
  const deleteOriginFile = vscode.commands.registerCommand('visualdbforpms.deleteOriginFile', () => {
    deleteOriginSchemasFile();
  });
  context.subscriptions.push(deleteOriginFile);

  // 명령어 체인 실행 예시
  // const chainCommands = vscode.commands.registerCommand('visualdbforpms.chainCommands', async () => {
  //   try {
  //     // 1. Hello World 명령어 실행
  //     await vscode.commands.executeCommand('visualdbforpms.helloWorld');
      
  //     // 2. 잠시 대기
  //     await new Promise(resolve => setTimeout(resolve, 1000));
      
  //     // 3. 파일 삭제 명령어 실행
  //     await vscode.commands.executeCommand('visualdbforpms.deleteOriginFile');
      
  //     // 4. 성공 메시지
  //     vscode.window.showInformationMessage('명령어 체인 실행 완료!');
      
  //     } catch (error) {
  //       console.error('Error executing command chain:', error);
  //       vscode.window.showErrorMessage(`명령어 실행 오류: ${error}`);
  //     }
  //   });
  //   context.subscriptions.push(chainCommands);
}

// This method is called when your extension is deactivated
export function deactivate() {}

	function getHtmlForWebviewSchema(schema: string[], modelCamelSnake: Map<string, string>, modelAIresMap: Map<string, string[]>): string {
	// const md = require('markdown-it')();
  // const html = md.render(markdown);
  console.log(`modelAIresMap: ${modelAIresMap}`)
  console.log(`modelAIresMap: ${JSON.stringify(modelAIresMap)}`)
  const modelAIresMapJson = JSON.stringify(Object.fromEntries(modelAIresMap));  // Map 객체를 JSON 문자열로 변환
  console.log(`modelAIresMapJson: ${modelAIresMapJson}`)
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
          width: 50%;
          height: 50%;
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
          console.log('Model AI Res Map:', modelAIresMap['PARTYROLEREL']);
          // console.log(${JSON.stringify(schema)})
          let mermaidContainer;
          document.addEventListener('DOMContentLoaded', () => {
            mermaidContainer = document.querySelector('.container');
            if (!mermaidContainer) {
              console.log('erorrororor')
              console.error("No <div class='mermaid'> element found in the DOM.");
            }
            const modelRegex = /erDiagram\s+([\w_]+)\s*{/g; // 'model' 키워드 뒤의 단어를 캡처

            // 각 다이어그램 블록을 <div> 요소로 추가
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

          // 팝업 닫기 함수
          function closePopup() {
            popupOverlay.style.display = 'none';
            popup.style.display = 'none';
          }

          // 닫기 버튼 및 오버레이 클릭 이벤트 추가
          popupClose.addEventListener('click', closePopup);
          popupOverlay.addEventListener('click', closePopup);



          })


        </script>
			</body>
			</html>
		`;
	}



	function getHtmlForWebview(mapData: Map<string, string[]>): string {
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
