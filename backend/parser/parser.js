var presentationManager = require("../presManager/presManager");

var colors = {
    "black":        0,
    "white":        1,
    "red":          2,    
    "green":        3,
    "blue":         4,
    "gray":         5,
    "yellow":       6,
    "cyan":         7,
    "magenta":      8
}



function Presentation() {
    this.title = "unnamed";
    this.cards = [];
    this.feedback = [];
    this.users = [];
}

function Cuecard() {
    this.backgroundColor = colors["white"]; // white by default
    this.transitionPhrase = ""; // If empty transition phrase, default to manual cuecard transition
    this.endWithPause = true;
    this.front = {
        backgroundColor: colors["white"], 
        content: {
            // TODO add font, size, and style attributes
            font: "Times New Roman",
            style: "normalfont",
            size: "12",
            colour: colors["black"], // black by default
            message: ""
        }
    };
    this.back = null; 
}

function CuecardBack() {
    this.backgroundColor = colors["white"];
    this.content = {
        font: "Times New Roman",
        style: "normalfont",
        size: "12",
        colour: colors["black"],
        message: ""
    };
}



Presentation.prototype.addCard = function(card) {
    this.cards.push(card);
}

Presentation.prototype.addUser = function(userID, role) {
    this.users.push({id: userID, permission: role});
}


/* Creates and stores away a presentation object, given its text representation, 
 * and a user ID. Returns true if parsing and storing are successful. Otherwise, 
 * throws an error.
 *
 * Number userID: 
 *      ID of user who owns the presentation to be parsed.
 * String text: 
 *      Text representation of presentation (e.g. contents of 
 *      sampleInputText.txt).
 */ 
parse = (req, res) => {
    var userID = req.body.userID;
    var text = req.body.text;
    console.log(req.body)
    // strip comments, whitespace at start of lines, and newlines
    text = parsePreProcessing(text);
    // console.log(text);
    
    // tokenize text with delimiter "\"
    var tokens = text.split("\\");
    for (let i = 0; i < tokens.length; i++) {
        tokens[i] = tokens[i].trim();
    } 
    // console.log(tokens);

    var keywords = {begin:"begin", end:"end", title:"title", point:"point", item:"item"};
    var contexts = {presentation:false, cuecard:false, details:false};
    var p = new Presentation();
    var c = null; // Cuecard

    for (let i = 0; i < tokens.length; i++) {
        var tokenNoWhitespace = tokens[i].replace(/\s/g, "");
        var attributesStartIndex = tokenNoWhitespace.indexOf("[");
        var attributesEndIndex = tokenNoWhitespace.indexOf("]");
        
	if (contexts["presentation"] === true) {
            if (contexts["cuecard"] === true) {
                if (contexts["details"] === true) {
                    if (tokenNoWhitespace === keywords["end"] + "{details}") {
                        contexts["details"] = false;
                    } else if (i == tokens.length - 3) {
                        throw {err: "No \\end{details} token found after \\begin{details}."};
                    } else {
                        let tokenNoKeyword = tokens[i].slice("item".length - tokens[i].length);
                        if (tokenNoKeyword[0] === "[" && tokenNoKeyword.slice(1, tokenNoKeyword.indexOf("=")) === "color") { 
                            var color = tokenNoKeyword.slice(tokenNoKeyword.indexOf("=") + 1, tokenNoKeyword.indexOf("]"));
                            if (color in colors) {
                                c.back.content["colour"] = colors[color]; 
                                c.transitionPhrase = tokenNoKeyword.slice(tokenNoKeyword.indexOf("]") + 1, tokenNoKeyword.length); // last added detail is transition phrase of cuecard
                                c.back.content["message"] += "\n >" + tokenNoKeyword.slice(tokenNoKeyword.indexOf("]") + 1, tokenNoKeyword.length);
                            }
                        } else {
                            c.transitionPhrase = tokenNoKeyword; // last added detail is transition phrase of cuecard
                            c.back.content["message"] += "\n >" + tokenNoKeyword;
                        }
                        // console.log(c.back.content);
                    }
                } else {
                    if (tokenNoWhitespace.slice(0, attributesStartIndex) === keywords["begin"] + "{details}"
                        || tokenNoWhitespace === keywords["begin"] + "{details}") {
                        contexts["details"] = true;
                    } else if (tokenNoWhitespace.slice(0, "point".length) === "point") {
                        let tokenNoKeyword = tokens[i].slice("point".length - tokens[i].length);
                        c.front.content["message"] = tokenNoKeyword;
                    }
                }

                if (tokenNoWhitespace === keywords["end"] + "{cuecard}") {
                    contexts["cuecard"] = false;
                    p.addCard(c);
                    
                } else if (i == tokens.length - 2) {
                    throw {err: "No \\end{cuecard} token found after \\begin{cuecard}."};
                }
            } else {
                if (tokenNoWhitespace.slice(0, attributesStartIndex) === keywords["begin"] + "{cuecard}"
                    || tokenNoWhitespace === keywords["begin"] + "{cuecard}") {
                    contexts["cuecard"] = true;
                    c = new Cuecard();
                    c.back = new CuecardBack();
                    
                    if (attributesStartIndex != -1 && attributesEndIndex > attributesStartIndex) {
                        var attributes = tokenNoWhitespace.slice(attributesStartIndex + 1, attributesEndIndex).split(",");
                        for (let j = 0; j < attributes.length; j++) {
                            attributes[j].trim();
                            var attributeKey = attributes[j].slice(0, attributes[j].indexOf("="));
                            var attributeValue = attributes[j].slice(attributes[j].indexOf("=") + 1, attributes[j].length);
                            
                            if (attributeKey === "color" && attributeValue in colors) c.backgroundColor = colors[attributeValue];
                            else if (attributeKey === "endpause" && attributeValue === "false") c.endWithPause = false;
                        }
                    }
                } else if (tokens[i].slice(0, "title".length) === "title") {
                    p.title = tokens[i].slice("title".length - tokens[i].length);
                }
            }

            if (tokenNoWhitespace === keywords["end"] + "{presentation}") {
                contexts["presentation"] = false;
            } else if (i == tokens.length - 1) {
                throw {err: "No \\end{presentation} token found after \\begin{presentation}."};
            }
        } else {
            if (tokenNoWhitespace === keywords["begin"] + "{presentation}") {
                contexts["presentation"] = true;
            }
        }
        // console.log(contexts);
    }

    p.addUser(userID, "owner");

    // console.log(p);
    presentationManager.storeImportedPres(p, userID).then((data) => {
        return res.status(200).json( data );
    }).catch((err) => {
        return res.status(500).json({ err });
    })
}

/* Strip comments (all characters on a line, after a "%"), tabs, and newlines
 * from text representation of a presentation.
 */
function parsePreProcessing(text) {
    
    function stripCommentsIn(str) {
        var leanText = "";
        
        // strip comments
        var comment = false;
    
        for (let i = 0; i < str.length; i++) {
            if (!comment) {
                if (str[i] != "%") {
                    leanText = leanText + str[i];
                } else {
                    comment = true;
                }
            } else {
                if (str[i] == "\n") {
                    comment = false;
                }
            }
        }
    
        return leanText;
    }
    
    function ltrimLinesAndStripNewlinesIn(str) {
        var leanText = "";
    
        // https://stackoverflow.com/questions/24282158/how-to-remove-the-white-space-at-the-start-of-the-string
        var ltrim = (line) => (line.replace(/^\s+/g, ''));
        
        var lines = str.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
            leanText = leanText + ltrim(lines[i]);
        }
    
        return leanText;
    }

    text = stripCommentsIn(text);
    text = ltrimLinesAndStripNewlinesIn(text);    

    return text;
}

/* Returns a text representation string of the presentation object identified by 
 * userID, and presID. See the contents of SampleInputText.txt for an example of 
 * a presentation's text representation. Throws an error if unable to retrieve 
 * the requested presentation object.
 *
 * Number userID:
 *      ID of user with owner or collaborator access to the requested 
 *      presentation.
 * Number presID:
 *      ID of presentation whose text representation has been requested.
 */
function textify(userID, presID) {
    // retrieve presentation object using userId and presId
    // add presentation tag
    // add title block
    // add cue-card blocks 
}


// module exports
module.exports = {
    parse,
    textify
}
