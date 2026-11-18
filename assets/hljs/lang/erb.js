function e(n){return{name:"ERB",subLanguage:"xml",contains:[n.COMMENT("<%#","%>"),{begin:"<%[%=-]?",end:"[%-]?%>",subLanguage:"ruby",excludeBegin:!0,excludeEnd:!0}]}}var r=e;export{r as default};
