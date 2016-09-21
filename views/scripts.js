
var MyVars = {
    keepTrying: true
};

$(window).unload(function() {
    $.sessionStorage.set("env", "prod");
});

$(document).ready(function () {

    // override value
    env = "prod";

    // Get the tokens
    var token = getToken();// get3LegToken();
    var auth = $("#authenticate");

    if (token === '') {
        auth.click(authenticate);
    }
    else {

        MyVars.token3Leg = token;
        MyVars.token2Leg = get2LegToken();

        auth.html('You\'re logged in' + ' with tokens: ' + MyVars.token3Leg + ' and ' + MyVars.token2Leg);
        auth.click(function () {
            if (confirm("You're logged in and your token is " + token + '\nWould you like to log out?')) {
                $.ajax({
                    url: '/api/logoff',
                    type: 'POST',
                    success: function (url) {
                        window.location.reload();
                    }
                }).done(function (url) {
                    window.location.reload();
                }).fail (function (xhr, ajaxOptions, thrownError) {
                    alert('logoff error!') ;
                }) ;
            }
        });


        // Fill the tree with A360 items
        prepareFilesTree();

        // Download list of available file formats
        //fillFormats();

    }

});

function base64encode(str) {
    var ret = "";
    if (window.btoa) {
        ret = window.btoa(str);
    } else {
        // IE9 support
        ret = window.Base64.encode(str);
    }

    // Remove ending '=' signs
    var ret2 = ret.replace(/=/g, '');

    console.log('base64encode result = ' + ret2);

    return ret2;
}


function getToken() {
    var xmlHttp = new XMLHttpRequest();
    xmlHttp.open("GET", '/api/token', false);
    xmlHttp.send(null);
    return xmlHttp.response;
}

function get2LegToken() {
    var xmlHttp = new XMLHttpRequest();
    xmlHttp.open("GET", '/api/2LegToken', false);
    xmlHttp.send(null);
    var response = JSON.parse(xmlHttp.responseText);
    return response.access_token;
}

function useToken(token) {
    $.ajax({
        url: '/api/token',
        type: 'POST',
        contentType: 'application/json',
        dataType: 'json',
        data: JSON.stringify({
            'token': token
        })
    });
}

function authenticate() {
    var env = "prod";
    $.ajax({
        url: '/api/authenticate',
        type: 'POST',
        contentType: 'application/json',
        dataType: 'json',
        data: JSON.stringify({
            'env': env
        })
    }).done(function (url) {
        // iframes are not allowed
        PopupCenter(url, "Autodesk Login", 800, 400);
    }).fail(function (err) {
        console.log('authenticate error\n' + err.statusText);
    });
}

function PopupCenter(url, title, w, h) {
    // Fixes dual-screen position                         Most browsers      Firefox
    var dualScreenLeft = window.screenLeft != undefined ? window.screenLeft : screen.left;
    var dualScreenTop = window.screenTop != undefined ? window.screenTop : screen.top;

    var width = window.innerWidth ? window.innerWidth : document.documentElement.clientWidth ? document.documentElement.clientWidth : screen.width;
    var height = window.innerHeight ? window.innerHeight : document.documentElement.clientHeight ? document.documentElement.clientHeight : screen.height;

    var left = ((width / 2) - (w / 2)) + dualScreenLeft;
    var top = ((height / 2) - (h / 2)) + dualScreenTop;
    var newWindow = window.open(url, title, 'scrollbars=yes, width=' + w + ', height=' + h + ', top=' + top + ', left=' + left);

    // Puts focus on the newWindow
    if (window.focus) {
        newWindow.focus();
    }
}

function prepareFilesTree() {
    $('#forgeFiles').jstree({
        'core': {
            'themes': { "icons": true },
            'check_callback': true, // make it modifiable
            'data': {
                "url": '/api/treeNode',
                "dataType": "json",
                "data": function (node) {
                    return {
                        "href": (node.id === '#' ? '#' : node.original.href)
                    };
                }
            }
        },
        
        'types': {
            'default': {
                'icon': 'glyphicon glyphicon-cloud'
            },
            '#': {
                'icon': 'glyphicon glyphicon-user'
            },
            'hubs': {
                'icon': 'glyphicon glyphicon-inbox'
            },
            'projects': {
                'icon': 'glyphicon glyphicon-list-alt'
            },
            'items': {
                'icon': 'glyphicon glyphicon-briefcase'
            },
            'folders': {
                'icon': 'glyphicon glyphicon-folder-open'
            },
            'versions': {
                'icon': 'glyphicon glyphicon-time'
            },
            'files': {
                'icon': 'glyphicon glyphicon-time'
            }
        },
        
        "plugins": ["types", "state"] // let's not use sort: , "sort"]
    }).bind("select_node.jstree", function (evt, data) {
        // Clean up previous instance
        //cleanupViewer();

        /*
        // Disable the hierarchy related controls for the time being
        $("#forgeFormats").attr('disabled', 'disabled');
        $("#downloadExport").attr('disabled', 'disabled');
        
        
        if (data.node.type === 'files') {
            $("#deleteFile").removeAttr('disabled');
        } else {
            $("#deleteFile").attr('disabled', 'disabled');
        }
        */
        
        if (data.node.type === 'versions' || data.node.type === 'files') {
            
            //$("#deleteManifest").removeAttr('disabled');

            //cleanupViewer();

            MyVars.keepTrying = true;
            MyVars.selectedNode = data.node;

            // E.g. because of the file upload we might have gotten a 2 legged
            // token, now we need a 3 legged again... ?
            if (data.node.type === 'files') {
                useToken(MyVars.token2Leg);
            } else {
                useToken(MyVars.token3Leg);
            }
            /*
            // Clear hierarchy tree
            $('#forgeHierarchy').empty().jstree('destroy');

            // Clear properties tree
            $('#forgeProperties').empty().jstree('destroy');

            // Delete cached data
            $('#forgeProperties').data('forgeProperties', null);

            updateFormats(data.node.original.fileType);
            */
            
            // Store info on selected file
            MyVars.rootFileName = data.node.original.rootFileName;
            MyVars.fileName = data.node.original.fileName;
            MyVars.fileExtType = data.node.original.fileExtType;
            MyVars.selectedUrn = base64encode(data.node.original.storage);
            
            
            // Fill hierarchy tree
            // format, urn, guid, objectIds, rootFileName, fileExtType
            showHierarchy(
                MyVars.selectedUrn,
                null,
                null,
                MyVars.rootFileName,
                MyVars.fileExtType
            );
            
            console.log(
                "data.node.original.storage = " + data.node.original.storage,
                ", data.node.original.fileName = " + data.node.original.fileName,
                ", data.node.original.fileExtType = " + data.node.original.fileExtType
            );
            
            // Show in viewer
            //initializeViewer(data.node.data);
            //initializeViewer(MyVars.selectedUrn);
            
        } else {
            //$("#deleteManifest").attr('disabled', 'disabled');

            // Switch back to 3 legged
            useToken(MyVars.token3Leg);

            // Just open the children of the node, so that it's easier
            // to find the actual versions
            $("#forgeFiles").jstree("open_node", data.node);

            // And clear trees to avoid confusion thinking that the
            // data belongs to the clicked model
            //$('#forgeHierarchy').empty().jstree('destroy');
            //$('#forgeProperties').empty().jstree('destroy');
            $('#forgeViewer').html('');
        }
    }).bind('loaded.jstree', function (e, data) {
        // Also read the files we have on the server
        getMyFiles();
    });
    
}

function cleanupViewer() {
    // Clean up previous instance
    if (MyVars.viewer) {
        MyVars.viewer.finish();
        $('#forgeViewer').html('');
        MyVars.viewer = null;
    }
}

function getMyFiles() {
    //useToken(MyVars.token2Leg);
    console.log("getMyFiles calling /api/myfiles");
    var ret = $.ajax({
        url: '/api/myfiles',
        type: 'GET'
    }).done(function (data) {
        console.log(data);
        for (itemId in data) {
            var item = data[itemId];
            addToFilesTree(item.objectId, item.objectKey);
        }

    }).fail(function () {
        console.log('GET /api/myfiles call failed');
    });
}


function addToFilesTree(objectId, fileName) {
    // we need to set
    // fileType = obj, ipt, etc
    // fileExtType = versions:autodesk.a360:CompositeDesign or not
    // fileName = e.g. myfile.ipt
    // storage = the objectId of the file
    var nameParts = fileName.split('.');
    var oldExtension = nameParts[nameParts.length - 1];
    var extension = oldExtension;

    // If it's a zip then we assume that the root file name
    // comes before the zip extension,
    // e.g. "scissors.iam.zip" >> "scissors.iam" is the root

    var myFileNodeId = $('#forgeFiles').jstree('get_node', "forgeFiles_myFiles");
    if (!myFileNodeId) {
        myFileNodeId = $('#forgeFiles').jstree('create_node', "#",
            {
                id: "forgeFiles_myFiles",
                text: "My Files",
                type: "hubs",
            }, "last"
        );
    }

    var myFileNode = $('#forgeFiles').jstree().get_node(myFileNodeId);
    for (var childId in myFileNode.children) {
        var childNodeId = myFileNode.children[childId];
        var childNode = $('#forgeFiles').jstree().get_node(childNodeId);

        // If this file is already listed then we've overwritten it on
        // the server and so no need to add it to the tree
        if (childNode.text === fileName) {
            return;
        }
    }

    var rootFileName = fileName;
    if (extension === 'zip') {
        rootFileName = fileName.slice(0, -4);
        // If it's a zip and it has another extension
        // then cut back to that
        if (nameParts.length > 2) {
            extension = nameParts[nameParts.length - 2];
        }
    }

    var newNode = $('#forgeFiles').jstree('create_node', "forgeFiles_myFiles",
        {
            text: fileName,
            type: "files",
            fileType: extension,
            fileExtType: (oldExtension === 'zip' ?
                'versions:autodesk.a360:CompositeDesign' : 'versions:autodesk.a360:File'),
            fileName: fileName,
            rootFileName: rootFileName,
            storage: objectId
        }, "last"
    );
}

function initializeViewer(urn) {
    // Clean up previous instance
    if (MyVars.viewer) {
        MyVars.viewer.finish();
        $('#forgeViewer').html('');
        MyVars.viewer = null;
    }

    // Get environment
    var env = 'prod';

    console.log("Launching Autodesk Viewer for: " + urn + " in environment: " + env);
    var viewerEnvironments = {
        dev: 'AutodeskDevelopment',
        stg: 'AutodeskStaging',
        prod: 'AutodeskProduction'
    };


    //if (urn.indexOf('urn:') !== 0)
        //urn = 'urn:' + urn;

    var options = {
        'document': 'urn:' + urn,
        env: 'AutodeskProduction',
        getAccessToken: getToken,
        //refreshToken: getToken
    };


    //$('#viewer').css("background-image", "url(/api/getThumbnail?urn=" + urn + ")");
    //var viewerElement = document.getElementById('forgeViewer');
    //MyVars.viewer = new Autodesk.Viewing.Private.GuiViewer3D(viewerElement);

    Autodesk.Viewing.Initializer(options, function () {
        //MyVars.viewer.initialize();
        //loadDocument(MyVars.viewer, options.document);
        loadViewer('forgeViewer', options.document)

    });

}

function loadViewer(containerId, documentId) {
                    var viewerContainer = document.getElementById(containerId);
                    var viewer = new Autodesk.Viewing.Private.GuiViewer3D(viewerContainer);
                    viewer.start();
    
                    Autodesk.Viewing.Document.load(documentId,
                            function (document) {
                                var rootItem = document.getRootItem();
                                var geometryItems = Autodesk.Viewing.Document.getSubItemsWithProperties(
                                        rootItem,
                                        { 'type': 'geometry', 'role': '3d' },
                                        true);
    
                                viewer.load(document.getViewablePath(geometryItems[0]));
                            },
    
                            // onErrorCallback
                            function (msg) {
                                console.log("Error loading document: " + msg);
                            }
                    );
                }

function loadDocument(viewer, documentId) {
    Autodesk.Viewing.Document.load(
        documentId,
        // onLoad
        function (doc) {
            var geometryItems = [];
            geometryItems = Autodesk.Viewing.Document.getSubItemsWithProperties(doc.getRootItem(), {
                'type': 'geometry',
                'role': '3d'
            }, true);
            if (geometryItems.length > 0)
                viewer.load(doc.getViewablePath(geometryItems[0]), null, null, null, doc.acmSessionId /*session for DM*/);
        },
        // onError
        function (errorMsg) {
            console.log('Viewer Error');
            //showThumbnail(documentId.substr(4, documentId.length - 1));
        }
    )
}

function showThumbnail(urn) {
    $('#forgeViewer').html('<img src="/api/getThumbnail?urn=' + urn + '"/>');
}

function showHierarchy(urn, guid, objectIds, rootFileName, fileExtType) {

    // You need to
    // 1) Post a job
    // 2) Get matadata (find the model guid you need)
    // 3) Get the hierarchy based on the urn and model guid

    // Get svf export in order to get hierarchy and properties
    // for the model
    var format = 'svf';
    askForFileType(format, urn, guid, objectIds, rootFileName, fileExtType, function () {

        getManifest(urn, function (manifest) {


            //getMetadata(urn, function (guid) {

                //getHierarchy(urn, guid, function (data) {
                    //showProgress("Retrieved hierarchy", "success");

                    //prepareHierarchyTree(urn, guid, data.data);

                    for (var derId in manifest.derivatives) {
                        var der = manifest.derivatives[derId];
                        // We just have to make sure there is an svf
                        // translation, but the viewer will find it
                        // from the urn
                        if (der.outputType === 'svf') {

                            initializeViewer(urn);
                        }
                    }
                //});
            //});
        });
        
    });
}

function askForFileType(format, urn, guid, objectIds, rootFileName, fileExtType, onsuccess) {
    console.log("askForFileType " + format + " for urn=" + urn);
    var advancedOptions = {
        'stl': {
            "format": "binary",
            "exportColor": true,
            "exportFileStructure": "multiple"
        },
        'obj': {
            "modelGuid": guid,
            "objectIds": objectIds
        }
    };

    $.ajax({
        url: '/api/export',
        type: 'POST',
        contentType: 'application/json',
        dataType: 'json',
        data: JSON.stringify(
            {
                urn: urn,
                format: format,
                advanced: advancedOptions[format],
                rootFileName: rootFileName,
                fileExtType: fileExtType
            }
        )
    }).done(function (data) {
        console.log(data);

        if (data.result === 'success' // newly submitted data
            || data.result === 'created') { // already submitted data
            getManifest(urn, function (res) {
                onsuccess(res);
            });
        }
    }).fail(function (err) {
        console.log('/api/export call failed\n' + err.statusText);
    });
}

function getManifest(urn, onsuccess) {
    console.log("getManifest for urn=" + urn);
    $.ajax({
        url: '/api/manifests/' + urn,
        type: 'GET'
    }).done(function (data) {
        console.log(data);
        json = JSON.parse(data);
        if (json.status !== 'failed') {
            if (json.progress !== 'complete') {
                if (MyVars.keepTrying) {
                    // Keep calling until it's done
                    window.setTimeout(function () {
                        getManifest(urn, onsuccess);
                    }, 500
                    );
                } else {
                    MyVars.keepTrying = true;
                }
            } else {
                onsuccess(json);
            }
            // if it's a failed translation best thing is to delete it
        } else {
            // Should we do automatic manifest deletion in case of a failed one?
            //delManifest(urn, function () {});
        }
    }).fail(function (err) {
        console.log('GET /api/manifest call failed\n' + err.statusText);
    });
}

