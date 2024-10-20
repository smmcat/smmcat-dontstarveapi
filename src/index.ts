import { Context, Schema } from 'koishi'
import { } from 'koishi-plugin-smmcat-localstorage'
import fs from "fs"
import path, { join } from 'path'

export const name = 'smmcat-dontstarveapi'

export interface Config { }
export const inject = ["localstorage"]
export const Config: Schema<Config> = Schema.object({})

export function apply(ctx: Context) {
  const baseApi = "https://api.dstserverlist.top/api/list/"
  const dontstarve = {
    guildBind: {},
    // 初始化信息
    async initData() {
      const dirPath = path.join(ctx.localstorage.basePath, 'smm_dontstarve');
      if (!fs.existsSync(dirPath)) {
        await fs.promises.mkdir(dirPath, { recursive: true })
      }
      const guildBindMap = fs.readdirSync(dirPath)
      const guildBind = {}
      const dict = { ok: 0, err: 0 }
      const eventList = guildBindMap.map((guildId: string) => {
        return new Promise(async (resolve, reject) => {
          try {
            guildBind[guildId] = JSON.parse(await ctx.localstorage.getItem(`smm_dontstarve/${guildId}`) || '{}')
            dict.ok++
            resolve(true)
          } catch (error) {
            dict.err++
            resolve(false)
          }
        })
      })
      await Promise.all(eventList)
      console.log(`[smmcat-dontstarveapi] 饥荒服务器绑定加载完成，成功${dict.ok}个，失败${dict.err}个`);

      this.guildBind = guildBind

    },
    // 添加绑定
    async addBind(guildId, { RowId = "", serveName = "" }) {
      if (!guildId) return { code: false, msg: "绑定失败，请在群内使用" }
      this.guildBind[guildId] = { RowId, serveName }
      await this.updateGuildBind(guildId)
      return { code: true, msg: `与饥荒服务器 ${serveName} 绑定成功，\n如若需要解绑，可以发送 /移除绑定` }
    },
    // 移除绑定
    async removeBind(guildId) {
      if (!this.guildBind[guildId] || !this.guildBind[guildId]?.RowId) {
        return { code: false, msg: "你群还没和任何饥荒服务器绑定呢！\n可以通过 /查询服务器 关键字 获取对应服务器的 RowId 进行绑定" }
      }
      this.guildBind[guildId] = { RowId: "", serveName: "" }
      await this.updateGuildBind(guildId)
      return { code: true, msg: "移除成功" }
    },
    // 查看绑定
    getBind(guildId) {
      if (!this.guildBind[guildId] || !this.guildBind[guildId]?.RowId) {
        return { code: false, msg: "你群还没和任何饥荒服务器绑定呢！\n可以通过 /查询服务器 关键字 获取对应服务器的 RowId 进行绑定" }
      }
      return { code: true, msg: `本群绑定的服务器名：${this.guildBind[guildId].serveName}\n服务器RowId：${this.guildBind[guildId].RowId}` }
    },
    // 返回群绑定的 信息
    getRowId(guildId) {
      if (!this.guildBind[guildId] || !this.guildBind[guildId]?.RowId) {
        return { code: false, msg: "你群还没和任何饥荒服务器绑定呢！\n可以通过 /查询服务器 关键字 获取对应服务器的 RowId 进行绑定" }
      }
      return { code: true, info: this.guildBind[guildId] }
    },
    // 更新本地数据
    async updateGuildBind(guildId) {
      const temp = this.guildBind[guildId]
      await ctx.localstorage.setItem(`smm_dontstarve/${guildId}`, JSON.stringify(temp));
    }
  }

  const webGet = {
    // 获取服务器列表
    async getServerList(name) {
      try {
        return await ctx.http.post(baseApi + `?name=${encodeURIComponent(name)}&pageCount=10&page=0`)
      } catch (error) {
        console.log(error);
      }
    },
    // 获取服务器详情
    async getServerDetail(RowId) {
      try {
        return await ctx.http.post(`https://api.dstserverlist.top/api/v2/server/details` +
          `?id=${RowId}&forceUpdate=false`)
      } catch (error) {
        console.log(error);
      }
    }
  }

  ctx.on('ready', () => {
    dontstarve.initData()
  })

  ctx
    .command('饥荒查服','查询饥荒联机版服务器信息')

  ctx
    .command('饥荒查服/查询服务器 <keyword>','通过关键字查询饥荒服务器列表')
    .action(async ({ session }, keyword) => {
      if (!keyword) {
        await session.send('请输入关键字')
        return
      }
      const result = await webGet.getServerList(keyword)
      if (!result) {
        await session.send('获取失败')
        return
      }
      const msgList = result.List.length > 0 ? `一共获得 ${result.AllCount < 10 ? result.AllCount : `${result.AllCount} (最多显示 10 个)`} 个服务器信息：\n\n` +
        result.List.map((item, index) => {
          return `[RowId] ${item.RowId}\n` +
            `[服务器名] ${item.Name}\n` +
            `[模式] ${item.Mode} / ${item.Intent}\n` +
            `[在线人数] ${item.Connected} / ${item.MaxConnections}\n` +
            `[当前季节] ${item.Season} ` +
            `[平台] ${item.Platform}`
        }).join('\n\n') + '\n\n' +
        '若群内需要绑定对应的服务器，则为 /设置绑定 {RowId}'
        : '没有查询到任何服务器信息...'
      await session.send(msgList)
    })

  ctx
    .command('饥荒查服/设置绑定 <RowId>',"通过服务器的RowId与本群绑定")
    .action(async ({ session }, RowId) => {
      if (!session.guildId) {
        await session.send('请在群内使用这个功能')
        return
      }
      if (!RowId) {
        await session.send('请输入饥荒服务器对应的 RowId！\ntip: 可以通过 /查询服务器 关键字 获得。')
        return
      }
      const result = await webGet.getServerDetail(RowId)
      const server = result.Server
      if (!result || !result.Server) {
        await session.send('绑定失败，检查你的 RowId 是否正确？')
        return
      }
      await session.send(`你群即将与名为 ${server.Name} 的服务器世界绑定。\n绑定后可使用 /本群服务器 指令来查看本群服务器详情\n如若确定，请在10秒内发送 是`)
      const type = await session.prompt(10000)
      if (type !== "是") {
        return
      }
      const msginfo = await dontstarve.addBind(session.guildId, { RowId: server.RowId, serveName: server.Name })
      await session.send(msginfo.msg)
    })

  ctx
    .command('饥荒查服/移除绑定',"解除群内已绑定的饥荒服务器信息")
    .action(async ({ session }, RowId) => {
      if (!session.guildId) {
        await session.send('请在群内使用这个功能')
        return
      }
      const guildBind = dontstarve.getRowId(session.guildId)
      if (!guildBind.code) {
        await session.send(guildBind.msg)
        return
      }
      await session.send(`你群即将移除与 ${guildBind.info.serveName} 的服务器世界绑定。\n如若确定，请在10秒内发送 是`)
      const type = await session.prompt(10000)
      if (type !== "是") {
        return
      }
      const result = await dontstarve.removeBind(session.guildId)
      await session.send(result.msg)
    })

  ctx
    .command('饥荒查服/查看绑定',"查看群内绑定的饥荒服务器信息")
    .action(async ({ session }) => {
      if (!session.guildId) {
        await session.send('请在群内使用这个功能')
        return
      }
      const result = dontstarve.getBind(session.guildId)
      await session.send(result.msg)
    })

  ctx
    .command('饥荒查服/本群服务器',"获取本群绑定的服务器详细信息")
    .action(async ({ session }) => {
      const guildBind = dontstarve.getRowId(session.guildId)
      if (!guildBind.code) {
        await session.send(guildBind.msg)
        return
      }
      await session.send(`本群绑定的饥荒服务器为：${guildBind.info.serveName}\n稍等，正在获取...`)
      const result = await webGet.getServerDetail(guildBind.info.RowId);
      const server = result.Server

      const dict = { spring: "春", summer: "夏", autumn: "秋", winter: "冬", survival: "生存", relaxed: "轻松", adventure: "冒险", endless: "无尽", cooperative: "合作" }

      const msg = `该服务器以下详情：\n\n` +
        `[服务器名] ${server.Name} （${server.Address.IsoCode}）\n` +
        `[服务器平台] ${server.Platform}\n` +
        `[服务器版本] ${server.Version}\n` +
        `[服务器简介] ${server.Description?.length > 10 ? server.Description.slice(0, 10) + '...' : server.Description}\n` +
        `[服务器状态] ${server.IsServerPaused ? "暂停" : "运行"}\n\n` +
        `[模式] ${dict[server.Mode] ? dict[server.Mode] : server.Mode} / ${dict[server.Intent] ? dict[server.Intent] : server.Intent}\n` +
        `[模组数量] ${!server.IsMods ? "无" : server.ModsInfo.length}\n` +
        `[在线人数] ${server.Connected} / ${server.MaxConnections}\n` +
        `[世界天数] ${server.DaysInfo.Day}天 (${dict[server.Season]} ${server.DaysInfo.DaysElapsedInSeason + 1}/${server.DaysInfo.TotalDaysSeason})\n` +
        `[是否友伤] ${server.IsPvp ? "是" : "否"}\n` +
        `[密码保护] ${server.IsPassword ? "是" : "否"}\n` +
        `[延迟] ${server.LastPing ? server.LastPing + "📶" : "???"}` +
        (server.Players.length ? `\n\n当前正在游玩的玩家：\n` + server.Players.map(item => `${item.Name}(${item.Prefab})`).join('\n') : "")
      await session.send(msg)
    })
}
