import * as mysql from 'mysql2/promise';
import * as fs from 'fs';
import * as path from 'path';

const schemaFromDb = path.join(__dirname, 'schemaFromDb.txt');


// MySQL 연결 설정
const connection = mysql.createPool({
	host: 'localhost',
	user: 'root',
	password: '1234',
	database: 'localpms',
  port: 33069,
})


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
      `, ['localpms','pms_button']);
    console.log(typeof rows);
    updateDataTypes(rows)



    } catch (err) {
      console.error('Error executing query: ', err.message);
    } finally {
      await connection.end()
    }
}
// DB 스키마 정보 타입 문자열 정제
function updateDataTypes(data:any){
  return data.map((item: any) => {
    if(item.data_type === "timestamp without time zone") {
      return { ... item, data_type: "timestamp"};
    }
    else if(item.data_type === "character varying") {
      return {...item, data_type: "character"};
    }
    return item; // 다른 값은 그대로 유지
  })
}




main()