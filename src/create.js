const fs = require("fs");
const path = require("path");
const { promisify } = require("util");
const axios = require("axios");
const ora = require("ora");
const Inquirer = require("inquirer");
let downloadGitRepo = require("download-git-repo");
downloadGitRepo = promisify(downloadGitRepo); // 可以把异步的 api 转换成 promise
const MetalSmith = require("metalsmith"); // 遍历文件夹 找需不需要渲染
// consolidate 统一了所有的模板引擎
let { render } = require("consolidate").ejs;
render = promisify(render);
let ncp = require("ncp");
ncp = promisify(ncp);
const { downloadDirectory } = require("./constants");
// create 的所有逻辑
// create 功能是创建项目
// 拉取你自己的所有项目列出来，让用户选 安装哪个项目
// 选完后 再显示所有的版本号
// https://api.github.com/orgs/zhu-cli/repos 获取组织下的仓库

// 1) 获取项目列表
const fetchRepoList = async () => {
  const { data } = await axios.get("https://api.github.com/orgs/zhu-cli/repos");
  return data;
};
// 抓取 tag 列表
const fetchTagList = async repo => {
  const { data } = await axios.get(
    `https://api.github.com/repos/zhu-cli/${repo}/tags`
  );
  return data;
};
const download = async (repo, tag) => {
  let api = `zhu-cli/${repo}`;
  if (tag) {
    api += `#${tag}`;
  }
  // /user/xxx/.template/repo
  const dest = `${downloadDirectory}/${repo}`;
  await downloadGitRepo(api, dest);
  return dest; // 下载的最终目录
};

// 封装 loading 效果
const waitFnloading = (fn, message) => async (...args) => {
  const spinner = ora(message);
  spinner.start();
  const result = await fn(...args);
  spinner.succeed();
  return result;
};

// 可能还需要用户配置一些数据，来结合渲染我的项目
module.exports = async projectName => {
  // 1. 获取项目的所有模板 (所有的)
  let repos = await waitFnloading(fetchRepoList, "fetching template ...")();
  repos = repos.map(item => item.name);

  // 在获取之前 显示loading 关闭loading
  // 选择模板 inquirer
  const { repo } = await Inquirer.prompt({
    name: "repo", // 获取选择后的结果
    type: "list",
    message: "please choise a template to create project",
    choices: repos
  });

  // 2) 通过当前选择的项目 拉取对应的版本
  let tags = await waitFnloading(fetchTagList, "fetching tags ...")(repo);
  tags = tags.map(item => item.name);

  const { tag } = await Inquirer.prompt({
    name: "tag", // 获取选择后的结果
    type: "list",
    message: "please choise tags to create project",
    choices: tags
  });

  // 3. 把模板放到一个临时目录里，以备后期使用

  // download-git-repo
  const result = await waitFnloading(download, "downloading template")(
    repo,
    tag
  );

  // 拿到了下载的目录 直接拷贝当前执行的目录即可 ncp
  // 把template下的文件，拷贝到执行命令的目录下

  // 如果有 ask.js 文件 // .template/xxx
  if (!fs.existsSync(path.join(result, "ask.js"))) {
    // 4. 拷贝
    // 这个目录 项目名字是否已经存在 如果存在提示当前已经存在
    await ncp(result, path.resolve(projectName));
  } else {
    // 复杂的需要模板渲染，渲染后再拷贝
    // 把 git 上的项目下载下来，如果有 ask 文件，就是一个复杂的模板，我们需要用户选择，选择后编译模板
    // metalsmith 只要是编译 都需要这个模块

    // 1. 让用户填写信息
    await new Promise((resolve, reject) => {
      MetalSmith(__dirname) // 如果你传入路径，它默认会遍历当前路径下的 src 文件夹
        .source(result)
        .destination(path.resolve(projectName))
        .use(async (files, metal, done) => {
          const args = require(path.join(result, "ask.js"));
          let obj = await Inquirer.prompt(args); // 用户填写的结果
          const meta = metal.metadata();
          Object.assign(meta, obj);
          delete files["ask.js"];
          done();
        })
        .use((files, metal, done) => {
          let obj = metal.metadata();
          Reflect.ownKeys(files).forEach(async file => {
            // 这个是要处理的
            if (file.includes("js") || file.includes("json")) {
              let content = files[file].contents.toString();
              if (content.includes("<%")) {
                content = await render(content, obj);
                files[file].contents = Buffer.from(content);  // 渲染
              }
            }
          });
          done();
        })
        .build(err => {
          if (err) {
            reject();
          } else {
            resolve();
          }
        });
    });
  }
};
