var express = require('express');
var router = express.Router();

var bodyParser = require('body-parser');
var jsonParser = bodyParser.json();

var config = require('./config');
var OAuth2 = require('oauth').OAuth2;

var lmv = require("view-and-data");

var async = require('async');
var request = require('request');

var dm = require("./dm"); // Data Management API
var md = require("./md"); // Model Derivative API


/////////////////////////////////////////////////////////////////
// Do authentication and authorization
/////////////////////////////////////////////////////////////////
router.post('/authenticate', jsonParser, function (req, res) {
    var env = 'prod';
    req.session.env = env;

    var baseUrl = 'https://developer.api.autodesk.com';

    var oauth2 = new OAuth2(
        "2iPA1uj6nqALolRpStRAAaEPK7U4H51g",
        "euJMIWAGL75uLXju",
        'https://developer.api.autodesk.com',
        '/authentication/v1/authorize',
        '/authentication/v1/gettoken',
        null);

    var authURL = oauth2.getAuthorizeUrl({
        redirect_uri: 'https://bardia-test.herokuapp.com/api/autodesk/callback',
        scope: 'data:read data:create data:write bucket:read bucket:create',
    });

    // this will await the callback
    router.get('/autodesk/callback', function (req, res) {
        oauth2.getOAuthAccessToken(
            req.query.code,
            {
                'grant_type': 'authorization_code',
                'redirect_uri': 'https://bardia-test.herokuapp.com/api/autodesk/callback'
            },
            function (e, access_token, refresh_token, results) {
                console.log(results);
                if (results) {
                    req.session.oauthcode = access_token;
                    //req.session.oauthcode3 = access_token;
                    req.session.cookie.maxAge = parseInt(results.expires_in) * 6000;
                    dm.getUsersMe("prod", req.session.oauthcode, function (data) {
                        // We need this because each users file upload info
                        // will be stored in their "env + userId" named folder
                        req.session.userId = data.userId;
                        console.log("Got userId = " + data.userId);
                        res.end('<script>window.opener.location.reload(false);window.close();</script>');
                        return;
                    });
                } else {
                    res.status(500).end(e.data);
                    return;
                }
            }
        );
    });

    res.end(JSON.stringify(authURL + '&response_type=code'));
});

/////////////////////////////////////////////////////////////////
// Finish the session with the server
/////////////////////////////////////////////////////////////////
router.post('/logoff', function (req, res) {
    req.session.destroy();
    res.end('ok');
});


/////////////////////////////////////////////////////////////////
// Request a 2 legged token. This is needed for operations
// where we interact directly with OSS - not with files on OSS
// that we got from A360
/////////////////////////////////////////////////////////////////
router.get('/2LegToken', function (req, res) {

    var params = {
        client_secret: 'euJMIWAGL75uLXju',
        client_id: '2iPA1uj6nqALolRpStRAAaEPK7U4H51g',
        grant_type: 'client_credentials',
        scope: 'data:read data:create'
    };

    request.post(
          'https://developer.api.autodesk.com/authentication/v1/authenticate',
          { form: params } ,
          function (error, response, body){
              //req.session.oauthcode = body.access_token;
              if (!error && response.statusCode == 200) {
                  //console.log(body);
                  res.end(body);
              }
          });
});


/////////////////////////////////////////////////////////////////
// Return the currently used token
// It could be the 3 legged or 2 legged token depending on
// which files the client is working with
/////////////////////////////////////////////////////////////////
router.get('/token', function (req, res) {
    // should be stored in session
    //res.end(JSON.stringify(req.session.oauthcode || null));
    res.end(req.session.oauthcode);
});

/////////////////////////////////////////////////////////////////
// Let's the client switch to the token that we need to use
// 2 legged or 3 legged
/////////////////////////////////////////////////////////////////
router.post('/token', jsonParser, function (req, res) {
    req.session.oauthcode = req.body.token;
    res.end('ok');
});

/////////////////////////////////////////////////////////////////
// Provide information to the tree control on the client
// about the hubs, projects, folders and files we have on
// our A360 account
/////////////////////////////////////////////////////////////////
router.get('/treeNode', function (req, res) {
    var href = req.query.href;
    console.log("treeNode for " + href);

    if (href === '#' || href === '%23') {
        // # stands for ROOT
        dm.getHubs("prod", req.session.oauthcode, function (hubs) {
            res.end(makeTree(hubs, true));
        });
    } else {
        var params = href.split('/');
        var parentResourceName = params[params.length - 2];
        var parentResourceId = params[params.length - 1];
        switch (parentResourceName) {
            case 'hubs':
                // if the caller is a hub, then show projects
                dm.getProjects(parentResourceId/*hub_id*/, "prod", req.session.oauthcode, function (projects) {
                    res.end(makeTree(projects, true));
                });
                break;
            case 'projects':
                // if the caller is a project, then show folders
                var hubId = params[params.length - 3];
                dm.getFolders(hubId, parentResourceId/*project_id*/, "prod", req.session.oauthcode, function (folders) {
                    res.end(makeTree(folders, true));
                });
                break;
            case 'folders':
                // if the caller is a folder, then show contents
                var projectId = params[params.length - 3];
                dm.getFolderContents(projectId, parentResourceId/*folder_id*/, "prod", req.session.oauthcode, function (folderContents) {
                    res.end(makeTree(folderContents, true));
                });
                break;
            case 'items':
                // if the caller is an item, then show versions
                var projectId = params[params.length - 3];
                dm.getItemVersions(projectId, parentResourceId/*item_id*/, "prod", req.session.oauthcode, function (versions) {
                    res.end(makeTree(versions, false));
                });
        }
    }
});

/////////////////////////////////////////////////////////////////
// Gets the information about the files we previously uploaded
// to our own bucket on OSS
/////////////////////////////////////////////////////////////////
router.get('/myfiles', function (req, res) {
    var bucketName = getBucketName(req);
    bucketName = encodeURIComponent(bucketName);
    // This should always use 2legged token
    dm.getObjectsInBucket("prod", req.session.oauthcode, bucketName, function (data) {
        var datas = [];
        var asyncTasks = [];
        for (var key in data.items) {
            var obj = data.items[key];
            (function (objectKey) {
                asyncTasks.push(function (callback) {
                    objectKey = encodeURIComponent(objectKey);
                    // This should always use 2legged token
                    dm.getObjectDetails("prod", req.session.oauthcode, bucketName, objectKey, function (data) {
                        datas.push(data);
                        callback();
                    });
                });
            })(obj.objectKey);
        }

        // Get back all the results
        async.parallel(asyncTasks, function (err) {
            // All tasks are done now
            res.json(datas);
        });
    });
});

/////////////////////////////////////////////////////////////////
// Send a translation request in order to get an SVF or other
// file format for our file
/////////////////////////////////////////////////////////////////
router.post('/export', jsonParser, function (req, res) {
    //env, token, urn, format, rootFileName, fileExtType, advanced

    md.postJobExport('prod', req.session.oauthcode, req.body.urn, req.body.format, req.body.rootFileName, req.body.fileExtType, req.body.advanced, function (data) {
        res.set('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(data));
    }, function (msg) {
        res.status(500).end(msg);
    }
    );
});

/////////////////////////////////////////////////////////////////
// Get the manifest of the given file. This will contain
// information about the various formats which are currently
// available for this file
/////////////////////////////////////////////////////////////////
router.get('/manifests/:urn', function (req, res) {
    var urn = req.params.urn;
    md.getManifest('prod', req.session.oauthcode, urn, function (data) {
        res.set('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(data));
    }, function (msg) {
        res.status(500).end(msg);
    }
    );
});

/////////////////////////////////////////////////////////////////
// Get the metadata of the given file. This will provide us with
// the guid of the avilable models in the file
/////////////////////////////////////////////////////////////////
router.get('/metadatas/:urn', function (req, res) {
    var urn = req.params.urn;
    md.getMetadata(req.session.env, req.session.oauthcode, urn, function (data) {
        res.set('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(data));
    }, function (msg) {
        res.status(500).end(msg);
    }
    );
});

/////////////////////////////////////////////////////////////////
// Get the hierarchy information for the model with the given
// guid inside the file with the provided urn
/////////////////////////////////////////////////////////////////
router.get('/hierarchy', function (req, res) {
    md.getHierarchy(req.session.env, req.session.oauthcode, req.query.urn, req.query.guid, function (data) {
        res.set('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(data));
    }, function (msg) {
        res.status(500).end(msg);
    }
    );
});

/////////////////////////////////////////////////////////////////
// Return the router object that contains the endpoints
/////////////////////////////////////////////////////////////////
module.exports = router;


/////////////////////////////////////////////////////////////////
// Collects the information that we need to pass to the
// file tree object on the client
/////////////////////////////////////////////////////////////////
function makeTree(listOf, canHaveChildren, data) {
    if (!listOf) return '';
    var treeList = [];
    listOf.forEach(function (item, index) {
        var fileExt = (item.attributes ? item.attributes.fileType : null);
        if (!fileExt && item.attributes && item.attributes.name) {
            var fileNameParts = item.attributes.name.split('.');
            if (fileNameParts.length > 1) {
                fileExt = fileNameParts[fileNameParts.length - 1];
            }
        }

        var treeItem = {
            href: item.links.self.href,
            storage: (item.relationships != null && item.relationships.storage != null ? item.relationships.storage.data.id : null),
            data: (item.relationships != null && item.relationships.derivatives != null ? item.relationships.derivatives.data.id : null),
            text: (item.attributes.displayName == null ? item.attributes.name : item.attributes.displayName),
            fileName: (item.attributes ? item.attributes.name : null),
            rootFileName: (item.attributes ? item.attributes.name : null),
            fileExtType: (item.attributes && item.attributes.extension ? item.attributes.extension.type : null),
            fileType: fileExt,
            type: item.type,
            children: canHaveChildren
        };
        console.log(treeItem);
        treeList.push(treeItem);
    });
    return JSON.stringify(treeList);
}

function getBucketName(req) {
    // userId is supposed to be just numbers, but just to be safe
    // since bucket names can only be lower case letters...
    var consumerKey = config.credentials.consumerKey(req.session.env).toLowerCase();
    //var userId = req.session.userId.toLowerCase();

    return consumerKey + userId;
}

