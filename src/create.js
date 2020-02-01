const axios = require("axios");
const ora = require("ora");
const Inquirer = require("inquirer");
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

  console.log(repo, tag); // 下载模板
  // 把模板放到一个临时目录里，以备后期使用
};
