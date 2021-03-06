import chromium from "chrome-aws-lambda";
import { document } from "../utils/dynamodbClient";
import path, { format } from "path";
import handlebars from "handlebars";
import fs, { read } from "fs";
import dayjs from "dayjs";
import { S3 } from "aws-sdk"

interface ICreateCertificate {
  id: string;
  name: string;
  grade: string;
}
interface ITemplate {
  id: string;
  name: string;
  grade: string;
  date: string;
  medal: string;
}
const compile = async function (data: ITemplate) {
  const filePath = path.join(process.cwd(), "src", "templates", "certificate.hbs");
  const html = fs.readFileSync(filePath, "utf-8");
  return handlebars.compile(html)(data);

}
export const handle = async (event) => {
  const { id, name, grade } = JSON.parse(event.body) as ICreateCertificate;
  const userVerify = await document.query({
    TableName: "users_certificates",
    KeyConditionExpression: "id = :id",
    ExpressionAttributeValues: {
      ":id": id
    }
  }).promise();

  const userExists = userVerify.Items[0];
  if (!userExists) {
    document.put({
      TableName: "users_certificates",
      Item: {
        id,
        name,
        grade
      }
    }).promise();
  }

  const medalPath = path.join(process.cwd(), "src", "templates", "selo.png");
  const medal = fs.readFileSync(medalPath, "base64")
  const data: ITemplate = {
    date: dayjs().format("DD/MM/YYYY"),
    grade,
    name,
    id,
    medal
  }
  const content = await compile(data);

  const browser = await chromium.puppeteer.launch({
    headless: true,
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath
  });
  const page = await browser.newPage();
  page.setContent(content);
  const pdf = page.pdf({
    format: "a4",
    landscape: true,
    path: process.env.IS_OFFLINE ? "certificate.pdf" : null,
    printBackground: true,
    preferCSSPageSize: true
  }
  );
  browser.close();
  const s3 = new S3();
  await s3.putObject({
    Bucket: "",
    Key: `${id}.pdf`,
    ACL: "public-read",
    Body: pdf,
    ContentType: "application/pdf"
  }).promise();
  return {
    statusCode: 201,
    body: JSON.stringify({
      message: "Certificate created"
    }),
    headers: {
      "Content-type": "application/json"
    }

  }
};