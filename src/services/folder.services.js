const defaultResponse = require("../utils/defaultResponse");
const prisma = require("../../config/prisma.config");
const checkFolderPermission = require("../utils/checkFolderPermission");
const fs = require('fs')
const path = require('path');
const createLog = require("../utils/createLog");

class FolderServices {
    async getFolders(req) {
        let {
            folder_id = null,
            folder_name = null,
            parent_id = null
        } = req.query

        if(!folder_id && !folder_name && !parent_id) {
            if(!await checkFolderPermission(req.id, 'root', 'read_folder')) return defaultResponse(401, 'Unauthorized', null)

            let all_folders = await prisma.folder.findMany()
            return defaultResponse(200, 'Folder(s) found', all_folders)
        }

        let where_data = {
            id: folder_id ? parseInt(folder_id) : undefined,
            name: folder_name ? folder_name : undefined,
            parentFolderId: parent_id ? parent_id == 'root' ?  null : parseInt(parent_id) : undefined
        }

        let folders = await prisma.folder.findMany({
            where: {
                AND:[where_data]
            }
        })

        let my_folders = await prisma.folderPermission.findMany({
            where: {
                userId: req.id
            },
            include: {
                folder: true
            }
        })

        let is_super_user = await checkFolderPermission(req.id, '*', 'superuser')
        let permission_folders = []

        if(is_super_user){
            permission_folders = folders
        } else if(my_folders.length > 0 && !is_super_user){
            folders.forEach(all_folder => {
                my_folders.forEach(my_folder => {
                    if(all_folder.id == my_folder.folderId){
                        permission_folders.push(all_folder)
                    }
                })
            })
        }

        if(permission_folders.length == 0) return defaultResponse(404, 'Folder(s) not found', null)

        return defaultResponse(200, 'Folder(s) found', permission_folders)
    }

    async insertFolder(req) {
        let {
            name,
            parent_id = null
        } = req.body
        
        if(!name) return defaultResponse(400, 'Name is required', null)

        let data = {
            name:name,
            parentFolderId: parent_id ? parent_id : null
        }

        if(!data.parentFolderId){
            delete data.parentFolderId
        }

        const exist_folder = await prisma.folder.findFirst({
            where: {
                AND:[{
                    name: data.name,
                    parentFolderId: data.parentFolderId ? data.parentFolderId : null
                }]
            }
        })

        if(exist_folder) return defaultResponse(400, 'Folder already exist in this folder', null)

        const folder = await prisma.folder.create({
            data 
        })

        return defaultResponse(201, 'Folder created', folder)
    }

    async deleteFolder(req) {
        let { folder_id } = req.body

        if(!folder_id) return defaultResponse(400, 'Folder id is required', null)

        const folder = await prisma.folder.findFirst({
            where: {
                id: folder_id
            }
        })

        if(!folder) return defaultResponse(400, 'Folder not found', null)
        if(!await checkFolderPermission(req.id, folder_id)) return defaultResponse(401, 'Unauthorized', null)

        await prisma.folderPermission.deleteMany({
            where: {
                folderId: folder_id
            }
        })

        let files_to_delete = await prisma.file.findMany({
            where: {
                folderId: folder_id
            }
        })

        await prisma.file.deleteMany({
            where: {
                folderId: folder_id
            }
        })

        if(files_to_delete.length > 0){
            files_to_delete.forEach(file => {
                if(file.path){
                    fs.unlink(path.join(__dirname, '..', '..', 'uploads', file.path), (err) => {
                        if (err) {
                            console.error(`[DELETE FILE: ${file.name}] ${err}]`)
                            return
                        }
                    })
                } 
            })
        }

        const delete_folder = await prisma.folder.delete({
            where: {
                id: folder_id
            }
        })
    
        await createLog(req.id, 'delete_folder', { 
            folder_id: folder_id, 
            files: files_to_delete
        })

        return defaultResponse(200, 'Folder deleted successfully', delete_folder)
    }

    async renameFolder(req) {
        let { folder_id, name = null } = req.body

        if(!folder_id) defaultResponse(400, 'Folder id is required', null)
        if(!name) defaultResponse(400, 'Name is required for make the rename', null)

        const folder = await prisma.folder.findFirst({
            where: {
                id: folder_id
            }
        })

        if(!folder) defaultResponse(400, 'Folder not found', null)

        const folder_replicated = await prisma.folder.findFirst({
            where: {
                AND:[{
                    name: name,
                    parentFolderId: folder.parentFolderId ? folder.parentFolderId : null
                }]
            }
        })

        if(folder_replicated) defaultResponse(400, 'Folder already exist in this folder', null)
        if(!await checkFolderPermission(req.id, folder_id)) return defaultResponse(401, 'Unauthorized', null)

        const exist_folder = await prisma.folder.update({
            where: {
                id: folder_id
            },
            data: {
                name: name
            }
        })

        return defaultResponse(200, 'Folder renamed successfully', exist_folder)
    }
}

module.exports = new FolderServices();